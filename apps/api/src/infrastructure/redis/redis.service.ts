import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

/**
 * Thin wrapper over ioredis for run-event pub/sub and prompt-cache access.
 * Subscribers need a dedicated connection (Redis pub/sub is mode-switching),
 * so `createSubscriber` duplicates the shared connection lazily.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private connection: IORedis | null = null;
  private readonly subscribers: IORedis[] = [];

  private conn(): IORedis {
    if (!this.connection) {
      this.connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
    }
    return this.connection;
  }

  createSubscriber(): IORedis {
    const subscriber = this.conn().duplicate();
    this.subscribers.push(subscriber);
    return subscriber;
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.conn().publish(channel, message);
  }

  /**
   * Set key-value pair in Redis with optional expiration
   */
  async set(key: string, value: string, expiryMode?: string, expiry?: string): Promise<void> {
    if (expiryMode && expiry) {
      await this.conn().set(key, value, expiryMode, expiry);
    } else {
      await this.conn().set(key, value);
    }
  }

  /**
   * Get value from Redis
   */
  async get(key: string): Promise<string | null> {
    return this.conn().get(key);
  }

  /**
   * Delete key from Redis
   */
  async del(key: string): Promise<void> {
    await this.conn().del(key);
  }

  async onModuleDestroy(): Promise<void> {
    for (const subscriber of this.subscribers) {
      subscriber.disconnect();
    }
    this.connection?.disconnect();
  }
}
