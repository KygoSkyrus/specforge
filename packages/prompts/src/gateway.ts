import { createHash } from 'node:crypto';
import type { ZodType, ZodTypeDef } from 'zod';
import { getPrompt } from './registry.js';

export type ModelTier = 'fast' | 'balanced' | 'reasoning';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  model: string;
}

export interface CompletionResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export interface LlmClient {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

const TASK_TIERS: Record<string, ModelTier> = {
  'spec.fromBrief': 'balanced',
};

export function resolveModelTier(task: string): ModelTier {
  const override = process.env.SPECFORGE_TIER_OVERRIDE;
  if (override === 'fast' || override === 'balanced' || override === 'reasoning') {
    return override;
  }
  return TASK_TIERS[task] ?? 'balanced';
}

export function resolveModel(tier: ModelTier): string {
  switch (tier) {
    case 'fast':
      return process.env.SPECFORGE_MODEL_FAST ?? 'gpt-4o-mini';
    case 'reasoning':
      return process.env.SPECFORGE_MODEL_REASONING ?? 'o4-mini';
    case 'balanced':
    default:
      return process.env.SPECFORGE_MODEL_BALANCED ?? 'gpt-4o';
  }
}

/** USD per 1M tokens (input/output) — estimates, reviewed per model change */
const MODEL_COST_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'o4-mini': { input: 1.1, output: 4.4 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const cost = MODEL_COST_PER_MTOK[model];
  if (!cost) return 0;
  return (
    (promptTokens / 1_000_000) * cost.input + (completionTokens / 1_000_000) * cost.output
  );
}

export interface PromptCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

export const PROMPT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

/** Cache key = hash(template + version + context + model), per plan §P1 */
export function promptCacheKey(input: {
  templateId: string;
  version: number;
  context: Record<string, string>;
  model: string;
}): string {
  const raw = `${input.templateId}@v${input.version}|${stableStringify(input.context)}|${input.model}`;
  return `promptcache:${createHash('sha256').update(raw).digest('hex')}`;
}

export type GatewayStatus =
  | 'cache_hit'
  | 'generating'
  | 'repairing'
  | 'validating'
  | 'succeeded'
  | 'failed';

export type GatewayEvent =
  | { type: 'status'; status: GatewayStatus; attempt?: number; message?: string }
  | {
      type: 'usage';
      model: string;
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
    };

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_JSON' | 'SCHEMA_INVALID' | 'EXHAUSTED_RETRIES',
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** Pull the first JSON object/array out of an LLM response (handles code fences + prose) */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.search(/[{[]/);
  if (start === -1) {
    throw new GatewayError('No JSON found in model output', 'NO_JSON');
  }
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);
  if (end <= start) {
    throw new GatewayError('Unbalanced JSON in model output', 'NO_JSON');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new GatewayError('Malformed JSON in model output', 'NO_JSON');
  }
}

export interface RunStructuredOptions<T> {
  /** Routing key, usually the template id without the @version suffix */
  task: string;
  templateId: string;
  context: Record<string, string>;
  schema: ZodType<T, ZodTypeDef, unknown>;
  client: LlmClient;
  cache?: PromptCache | undefined;
  maxRepairs?: number | undefined;
  onEvent?: ((event: GatewayEvent) => void) | undefined;
}

export interface RunStructuredResult<T> {
  data: T;
  cached: boolean;
  attempts: number;
  usage: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  };
}

/**
 * Run a registered prompt through the gateway:
 * route to a tiered model → consult cache → call → validate against a Zod
 * contract → repair loop (≤ maxRepairs retries with validation feedback).
 */
export async function runStructured<T>(
  opts: RunStructuredOptions<T>,
): Promise<RunStructuredResult<T>> {
  const template = getPrompt(opts.templateId);
  const tier = resolveModelTier(opts.task);
  const model = resolveModel(tier);
  const maxAttempts = (opts.maxRepairs ?? 2) + 1;
  const onEvent = opts.onEvent;

  const cacheKey = promptCacheKey({
    templateId: template.id,
    version: template.version,
    context: opts.context,
    model,
  });

  if (opts.cache) {
    const cachedRaw = await opts.cache.get(cacheKey);
    if (cachedRaw !== null) {
      const parsed = opts.schema.safeParse(safeJson(cachedRaw));
      if (parsed.success) {
        onEvent?.({ type: 'status', status: 'cache_hit' });
        return {
          data: parsed.data,
          cached: true,
          attempts: 0,
          usage: { model, promptTokens: 0, completionTokens: 0, costUsd: 0 },
        };
      }
    }
  }

  const messages: ChatMessage[] = [{ role: 'user', content: template.user(opts.context) }];
  let promptTokens = 0;
  let completionTokens = 0;
  let lastError: GatewayError = new GatewayError('Generation failed', 'EXHAUSTED_RETRIES');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onEvent?.({
      type: 'status',
      status: attempt === 1 ? 'generating' : 'repairing',
      attempt,
    });

    let completion: CompletionResult;
    try {
      completion = await opts.client.complete({ system: template.system, messages, model });
    } catch (err) {
      lastError = new GatewayError(
        `Model call failed: ${err instanceof Error ? err.message : String(err)}`,
        'NO_JSON',
      );
      continue;
    }

    promptTokens += completion.promptTokens;
    completionTokens += completion.completionTokens;

    onEvent?.({ type: 'status', status: 'validating', attempt });

    try {
      const json = extractJson(completion.text);
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new GatewayError(zodSummary(parsed.error), 'SCHEMA_INVALID');
      }

      const costUsd = estimateCostUsd(model, promptTokens, completionTokens);
      onEvent?.({ type: 'usage', model, promptTokens, completionTokens, costUsd });

      if (opts.cache) {
        await opts.cache.set(cacheKey, completion.text, PROMPT_CACHE_TTL_SECONDS);
      }

      return {
        data: parsed.data,
        cached: false,
        attempts: attempt,
        usage: { model, promptTokens, completionTokens, costUsd },
      };
    } catch (err) {
      lastError =
        err instanceof GatewayError
          ? err
          : new GatewayError(String(err), 'SCHEMA_INVALID');
    }

    messages.push({ role: 'assistant', content: completion.text });
    messages.push({
      role: 'user',
      content: `Your previous output was rejected by schema validation:\n${lastError.message}\nReturn ONLY corrected JSON matching the schema. No prose.`,
    });
  }

  onEvent?.({ type: 'status', status: 'failed', message: lastError.message });
  throw lastError.code === 'EXHAUSTED_RETRIES'
    ? lastError
    : new GatewayError(`Validation failed after ${maxAttempts} attempts: ${lastError.message}`, 'EXHAUSTED_RETRIES');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function zodSummary(error: { issues: { path: (string | number | symbol)[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
