import { describe, expect, it, vi, afterEach } from 'vitest';
import { z } from 'zod';
import {
  estimateCostUsd,
  extractJson,
  GatewayError,
  promptCacheKey,
  resolveModel,
  resolveModelTier,
  runStructured,
  type LlmClient,
} from './gateway.js';

const TestSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().positive(),
});

function scriptedClient(responses: string[]): LlmClient & { calls: number } {
  let index = 0;
  return {
    calls: 0,
    async complete() {
      const text = responses[Math.min(index, responses.length - 1)] ?? '';
      index++;
      this.calls++;
      return { text, promptTokens: 100, completionTokens: 50, model: 'test-model' };
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON with language tag', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON embedded in prose', () => {
    expect(extractJson('Here you go:\n{"a":{"b":2}}\nHope that helps!')).toEqual({
      a: { b: 2 },
    });
  });

  it('throws NO_JSON when nothing parseable exists', () => {
    expect(() => extractJson('no json at all')).toThrowError(GatewayError);
  });
});

describe('runStructured', () => {
  const opts = {
    task: 'spec.fromBrief',
    templateId: 'spec.fromBrief@v1',
    context: { brief: 'A client wants a todo app' },
    schema: TestSchema,
  };

  it('succeeds on first attempt with valid output', async () => {
    const client = scriptedClient(['{"title":"Spec","count":3}']);
    const result = await runStructured({ ...opts, client });

    expect(result.data).toEqual({ title: 'Spec', count: 3 });
    expect(result.attempts).toBe(1);
    expect(result.cached).toBe(false);
    expect(result.usage.promptTokens).toBe(100);
    expect(result.usage.completionTokens).toBe(50);
    expect(client.calls).toBe(1);
  });

  it('repairs invalid output using validation feedback', async () => {
    const client = scriptedClient([
      '{"title":"","count":-1}',
      '{"title":"Fixed","count":1}',
    ]);
    const result = await runStructured({ ...opts, client });

    expect(result.data).toEqual({ title: 'Fixed', count: 1 });
    expect(result.attempts).toBe(2);
    expect(client.calls).toBe(2);
    expect(result.usage.promptTokens).toBe(200);
  });

  it('repairs non-JSON output', async () => {
    const client = scriptedClient(['I cannot help with that.', '{"title":"Ok","count":2}']);
    const result = await runStructured({ ...opts, client });
    expect(result.data.title).toBe('Ok');
    expect(result.attempts).toBe(2);
  });

  it('throws EXHAUSTED_RETRIES after maxRepairs', async () => {
    const client = scriptedClient(['garbage']);
    await expect(
      runStructured({ ...opts, client, maxRepairs: 2 }),
    ).rejects.toMatchObject({ code: 'EXHAUSTED_RETRIES' });
    expect(client.calls).toBe(3);
  });

  it('returns cached results without calling the model', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue('{"title":"Cached","count":9}'),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const client = scriptedClient([]);
    const onEvent = vi.fn();
    const result = await runStructured({ ...opts, client, cache, onEvent });

    expect(result.cached).toBe(true);
    expect(result.data.count).toBe(9);
    expect(client.calls).toBe(0);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'cache_hit' }));
  });

  it('ignores cache entries that no longer validate', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue('{"title":123,"count":"x"}'),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const client = scriptedClient(['{"title":"Fresh","count":4}']);
    const result = await runStructured({ ...opts, client, cache });

    expect(result.cached).toBe(false);
    expect(result.data.title).toBe('Fresh');
  });

  it('stores successful output in the cache', async () => {
    const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
    await runStructured({ ...opts, client: scriptedClient(['{"title":"S","count":1}']), cache });
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^promptcache:/), expect.any(String), expect.any(Number));
  });

  it('emits usage events with computed cost', async () => {
    const onEvent = vi.fn();
    await runStructured({
      ...opts,
      client: scriptedClient(['{"title":"S","count":1}']),
      onEvent,
    });
    const usage = onEvent.mock.calls.map((c) => c[0]).find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ type: 'usage', promptTokens: 100, completionTokens: 50 });
    expect(usage.costUsd).toBeGreaterThan(0);
  });
});

describe('routing', () => {
  it('maps known tasks to their tier', () => {
    expect(resolveModelTier('spec.fromBrief')).toBe('balanced');
    expect(resolveModelTier('unknown.task')).toBe('balanced');
  });

  it('honours tier override env', () => {
    vi.stubEnv('SPECFORGE_TIER_OVERRIDE', 'fast');
    expect(resolveModelTier('spec.fromBrief')).toBe('fast');
  });

  it('resolves models per tier with env override', () => {
    expect(resolveModel('fast')).toBe('gpt-4o-mini');
    vi.stubEnv('SPECFORGE_MODEL_FAST', 'my-fast-model');
    expect(resolveModel('fast')).toBe('my-fast-model');
  });
});

describe('estimateCostUsd', () => {
  it('computes input + output cost', () => {
    expect(estimateCostUsd('gpt-4o-mini', 1_000_000, 500_000)).toBeCloseTo(0.15 + 0.3, 6);
  });

  it('returns zero for unknown models', () => {
    expect(estimateCostUsd('mystery-model', 1000, 1000)).toBe(0);
  });
});

describe('promptCacheKey', () => {
  it('is stable regardless of context key order', () => {
    const a = promptCacheKey({ templateId: 't', version: 1, context: { a: '1', b: '2' }, model: 'm' });
    const b = promptCacheKey({ templateId: 't', version: 1, context: { b: '2', a: '1' }, model: 'm' });
    expect(a).toBe(b);
  });

  it('differs across models', () => {
    const a = promptCacheKey({ templateId: 't', version: 1, context: {}, model: 'm1' });
    const b = promptCacheKey({ templateId: 't', version: 1, context: {}, model: 'm2' });
    expect(a).not.toBe(b);
  });
});
