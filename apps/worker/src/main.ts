import { Worker } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import {
  OpenAiCompatibleClient,
  PROMPT_CACHE_TTL_SECONDS,
  getPrompt,
  runStructured,
  type GatewayEvent,
  type LlmClient,
  type PromptCache,
} from '@specforge/prompts';
import {
  AiJobPayloadSchema,
  SpecFromBriefOutputSchema,
  type GeneratedRequirement,
  type SpecFromBriefOutput,
} from '@specforge/schemas';
import { assignRequirementKey, ambiguityHeuristics } from '@specforge/domain';

const logger = pino({ name: 'specforge-worker' });
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

interface RunEvent {
  type: string;
  status?: string;
  message?: string;
  specId?: string;
  at: string;
}

const prisma = new PrismaClient();
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

function runChannel(runId: string): string {
  return `run:${runId}`;
}

async function publishRunEvent(runId: string, event: Omit<RunEvent, 'at'>): Promise<void> {
  await connection.publish(runChannel(runId), JSON.stringify({ ...event, at: new Date().toISOString() }));
}

/** Redis-backed prompt cache keyed by hash(template+context+model) */
class RedisPromptCache implements PromptCache {
  async get(key: string): Promise<string | null> {
    return connection.get(key);
  }

  async set(key: string, value: string, ttlSeconds = PROMPT_CACHE_TTL_SECONDS): Promise<void> {
    await connection.set(key, value, 'EX', ttlSeconds);
  }
}

/**
 * Deterministic mock used when no OPENAI_API_KEY is configured.
 * Emits schema-valid output so the whole pipeline (validation, persistence,
 * SSE) is demoable offline. Never used in production routing.
 */
class MockLlmClient implements LlmClient {
  async complete(): Promise<{ text: string; promptTokens: number; completionTokens: number; model: string }> {
    const output = {
      title: 'Generated Spec',
      requirements: [
        {
          kind: 'functional',
          title: 'User authentication',
          body:
            'Users must authenticate via email and password with clear error handling on invalid credentials.',
          priority: 'must',
          openQuestions: ['Should passwordless magic links be supported?'],
          sourceRefs: [{ kind: 'brief', ref: 'brief-1' }],
        },
        {
          kind: 'functional',
          title: 'Project dashboard',
          body:
            'The system shall display all projects for the signed-in user with status and last-updated timestamps.',
          priority: 'must',
        },
        {
          kind: 'non_functional',
          title: 'Fast page loads',
          body: 'The application should feel fast and responsive when navigating between pages.',
          priority: 'should',
        },
        {
          kind: 'assumption',
          title: 'Single tenant per org',
          body: 'Each organization operates in an isolated tenant context.',
          priority: 'should',
        },
        {
          kind: 'out_of_scope',
          title: 'Mobile native apps',
          body: 'Native iOS/Android apps are not included in v1.',
          priority: 'wont',
        },
      ],
    };
    return {
      text: JSON.stringify(output),
      promptTokens: Math.ceil(JSON.stringify(output).length / 4),
      completionTokens: Math.ceil(JSON.stringify(output).length / 4),
      model: 'mock',
    };
  }
}

function makeLlmClient(): LlmClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — using deterministic mock client');
    return new MockLlmClient();
  }
  return new OpenAiCompatibleClient({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
  });
}

/** Persist a validated generation result: requirements with stable keys + ambiguity scores */
async function persistGeneratedSpec(
  payload: { orgId: string; specId: string; runId: string },
  output: SpecFromBriefOutput,
  usage: { model: string; promptTokens: number; completionTokens: number; costUsd: number },
  latencyMs: number,
): Promise<void> {
  const keysByKind = new Map<string, string[]>();
  const rows = output.requirements.map((req: GeneratedRequirement, index) => {
    const existing = keysByKind.get(req.kind) ?? [];
    const key = assignRequirementKey(req.kind, existing);
    existing.push(key);
    keysByKind.set(req.kind, existing);

    const ambiguity = ambiguityHeuristics({ title: req.title, body: req.body });
    return {
      orgId: payload.orgId,
      specId: payload.specId,
      key,
      kind: req.kind,
      title: req.title,
      body: req.body,
      priority: req.priority,
      ambiguityScore: ambiguity.score,
      openQuestions: req.openQuestions ?? [],
      sourceRefs: req.sourceRefs ?? [],
      order: index,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.spec.update({
      where: { id: payload.specId },
      data: { title: output.title },
    });
    await tx.requirement.deleteMany({ where: { specId: payload.specId } });
    await tx.requirement.createMany({ data: rows });
    await tx.aiRun.update({
      where: { id: payload.runId },
      data: {
        status: 'succeeded',
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: usage.costUsd,
        latencyMs,
      },
    });
    await tx.auditLog.create({
      data: {
        orgId: payload.orgId,
        action: 'spec.generate',
        resourceType: 'Spec',
        resourceId: payload.specId,
        afterHash: String(rows.length),
      },
    });
  });
}

async function markRunFailed(payload: { runId: string; orgId: string }, error: string): Promise<void> {
  try {
    await prisma.aiRun.update({
      where: { id: payload.runId },
      data: { status: 'failed', error: error.slice(0, 1000), latencyMs: null },
    });
  } catch (err) {
    logger.error({ err, runId: payload.runId }, 'Failed to record AiRun failure');
  }
}

async function processAiJob(raw: unknown): Promise<void> {
  const payloadParsed = AiJobPayloadSchema.safeParse(raw);
  if (!payloadParsed.success) {
    throw new Error(`Invalid job payload: ${payloadParsed.error.message}`);
  }
  const payload = payloadParsed.data;
  const start = Date.now();
  const template = getPrompt(payload.template);

  const run = await prisma.aiRun.findUnique({ where: { id: payload.runId } });
  if (!run || (run.status !== 'queued' && run.status !== 'failed')) {
    logger.warn({ runId: payload.runId, status: run?.status }, 'Skipping run');
    return;
  }
  await prisma.aiRun.update({ where: { id: payload.runId }, data: { status: 'running' } });
  await publishRunEvent(payload.runId, { type: 'status', status: 'running' });

  const brief = await prisma.brief.findUnique({ where: { id: payload.briefId } });
  if (!brief) throw new Error(`Brief ${payload.briefId} not found`);

  const onEvent = (event: GatewayEvent): void => {
    if (event.type === 'status') {
      void publishRunEvent(payload.runId, { type: 'status', status: event.status, message: event.message });
    }
  };

  try {
    const result = await runStructured({
      task: template.id,
      templateId: payload.template,
      context: { brief: brief.raw },
      schema: SpecFromBriefOutputSchema,
      client: makeLlmClient(),
      cache: new RedisPromptCache(),
      onEvent,
    });

    await persistGeneratedSpec(
      payload,
      result.data,
      result.usage,
      Date.now() - start,
    );

    await publishRunEvent(payload.runId, { type: 'done', specId: payload.specId });
    logger.info(
      {
        runId: payload.runId,
        specId: payload.specId,
        attempts: result.attempts,
        cached: result.cached,
        requirementCount: result.data.requirements.length,
        latencyMs: Date.now() - start,
        costUsd: result.usage.costUsd,
      },
      'AI job completed',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRunFailed(payload, message);
    await publishRunEvent(payload.runId, { type: 'failed', message });
    logger.error({ runId: payload.runId, err: message }, 'AI job failed');
    throw err;
  }
}

const worker = new Worker<unknown>(
  'ai-generation',
  async (job) => processAiJob(job.data),
  { connection },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down worker');
  await worker.close();
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

logger.info('SpecForge worker started — listening on ai-generation queue');
