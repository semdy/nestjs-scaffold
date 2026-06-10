import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RedisSetOptions {
  ttlSeconds?: number;
  ttlMilliseconds?: number;
  nx?: boolean;
  xx?: boolean;
}

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.getOrThrow<string>('REDIS_HOST'),
      port: configService.get<number>('REDIS_PORT', 6379),
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      db: configService.get<number>('REDIS_DB', 0),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 1000, 10000);
        this.logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('reconnecting', () => this.logger.warn('Redis reconnecting...'));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async set(key: string, value: string, options: RedisSetOptions = {}): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.setWithOptions(key, value, options);
    return result === 'OK';
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson<T>(key: string, value: T, options: RedisSetOptions = {}): Promise<boolean> {
    return this.set(key, JSON.stringify(value), options);
  }

  async delete(...keys: string[]): Promise<number> {
    if (!keys.length) {
      return 0;
    }
    await this.ensureConnected();
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    return (await this.client.exists(key)) === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnected();
    return (await this.client.expire(key, ttlSeconds)) === 1;
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnected();
    return this.client.ttl(key);
  }

  async increment(key: string, by = 1): Promise<number> {
    await this.ensureConnected();
    return by === 1 ? this.client.incr(key) : this.client.incrby(key, by);
  }

  async decrement(key: string, by = 1): Promise<number> {
    await this.ensureConnected();
    return by === 1 ? this.client.decr(key) : this.client.decrby(key, by);
  }

  async hget(key: string, field: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    await this.ensureConnected();
    return this.client.hset(key, field, value);
  }

  async hmset(key: string, values: Record<string, string | number | boolean>): Promise<boolean> {
    await this.ensureConnected();
    const normalized = Object.fromEntries(
      Object.entries(values).map(([field, value]) => [field, String(value)]),
    );
    return (await this.client.hset(key, normalized)) > 0;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    await this.ensureConnected();
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    if (!fields.length) {
      return 0;
    }
    await this.ensureConnected();
    return this.client.hdel(key, ...fields);
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    await this.ensureConnected();
    return this.client.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    await this.ensureConnected();
    return this.client.rpush(key, ...values);
  }

  async lrange(key: string, start = 0, stop = -1): Promise<string[]> {
    await this.ensureConnected();
    return this.client.lrange(key, start, stop);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    await this.ensureConnected();
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    await this.ensureConnected();
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    await this.ensureConnected();
    return this.client.smembers(key);
  }

  async deleteByPattern(pattern: string, batchSize = 500): Promise<number> {
    await this.ensureConnected();
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
      cursor = nextCursor;
      if (keys.length) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }

  private async setWithOptions(
    key: string,
    value: string,
    options: RedisSetOptions,
  ): Promise<'OK' | null> {
    if (options.ttlSeconds !== undefined && options.nx) {
      return this.client.set(key, value, 'EX', options.ttlSeconds, 'NX');
    }
    if (options.ttlSeconds !== undefined && options.xx) {
      return this.client.set(key, value, 'EX', options.ttlSeconds, 'XX');
    }
    if (options.ttlMilliseconds !== undefined && options.nx) {
      return this.client.set(key, value, 'PX', options.ttlMilliseconds, 'NX');
    }
    if (options.ttlMilliseconds !== undefined && options.xx) {
      return this.client.set(key, value, 'PX', options.ttlMilliseconds, 'XX');
    }
    if (options.ttlSeconds !== undefined) {
      return this.client.set(key, value, 'EX', options.ttlSeconds);
    }
    if (options.ttlMilliseconds !== undefined) {
      return this.client.set(key, value, 'PX', options.ttlMilliseconds);
    }
    if (options.nx) {
      return this.client.set(key, value, 'NX');
    }
    if (options.xx) {
      return this.client.set(key, value, 'XX');
    }
    return this.client.set(key, value);
  }

  async onApplicationShutdown(): Promise<void> {
    this.client.disconnect();
  }
}
