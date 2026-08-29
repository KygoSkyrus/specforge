import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { AiJobPayload } from '@specforge/schemas';

export const AI_GENERATION_QUEUE = 'ai-generation';

/**
 * Producer side of the ai-generation queue. The worker (apps/worker) is the
 * consumer; payloads are validated against AiJobPayloadSchema on both sides.
 */
@Injectable()
export class AiQueueService implements OnModuleDestroy {
  private queue: Queue<AiJobPayload> | null = null;

  private conn(): Queue<AiJobPayload> {
    if (!this.queue) {
      this.queue = new Queue<AiJobPayload>(AI_GENERATION_QUEUE, {
        connection: {
          url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      });
    }
    return this.queue;
  }

  async enqueueGeneration(payload: AiJobPayload): Promise<{ jobId: string }> {
    const job = await this.conn().add('generate', payload, { jobId: `run:${payload.runId}` });
    return { jobId: job.id ?? payload.runId };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
