import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import IORedis from 'ioredis';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard';
import { PolicyService } from '../auth/policy.service';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

function runChannel(runId: string): string {
  return `run:${runId}`;
}

/**
 * SSE stream of run events: status transitions while the worker processes,
 * then a terminal `done`/`failed` event. If the run already finished, a single
 * snapshot event is sent and the stream closes.
 */
@Controller('runs')
@UseGuards(AuthGuard)
export class RunsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly redis: RedisService,
  ) {}

  @Get(':id/stream')
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    this.policy.assertCan(
      this.policy.defineAbilityFor({ role: user.role, orgId: user.orgId, userId: user.id }),
      'read',
      'Spec',
    );

    const run = await this.prisma.aiRun.findFirst({
      where: { id, orgId: user.orgId },
    });
    if (!run) throw new NotFoundException('Run not found');

    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    const send = (event: unknown): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    if (TERMINAL_STATUSES.has(run.status)) {
      send({
        type: run.status === 'succeeded' ? 'done' : 'failed',
        status: run.status,
        specId: run.specId ?? undefined,
        error: run.error ?? undefined,
        at: new Date().toISOString(),
      });
      res.end();
      return;
    }

    const subscriber = this.redis.createSubscriber();
    let closed = false;

    const heartbeat = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, 15_000);

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      subscriber.unsubscribe(runChannel(id)).catch(() => undefined);
      subscriber.disconnect();
      res.end();
    };

    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== runChannel(id) || closed) return;
      send(message);
      try {
        const parsed = JSON.parse(message) as { type?: string };
        if (parsed.type === 'done' || parsed.type === 'failed') cleanup();
      } catch {
        // malformed event — keep the stream open
      }
    });

    res.on('close', cleanup);

    await subscriber.subscribe(runChannel(id));
    // Re-emit current status in case an event fired between creation and subscribe
    send({ type: 'status', status: run.status, at: new Date().toISOString() });
  }
}
