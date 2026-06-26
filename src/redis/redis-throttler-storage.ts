import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const BLOCK_KEY_PREFIX = 'throttler:block:';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    _limit: number,
    blockDuration: number,
    _throttlerName: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<ThrottlerStorageRecord> {
    const blockKey = `${BLOCK_KEY_PREFIX}${key}`;

    // Check if currently blocked
    const blockTtl = await this.redis.ttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: blockTtl * 1000, // Redis returns seconds, convert to ms
      };
    }

    // Atomic increment with TTL
    const totalHits = await this.redis.increment(key);
    if (totalHits === 1) {
      // First hit — set TTL only once to avoid extending the window
      await this.redis.expire(key, Math.ceil(ttl / 1000));
    }

    const timeToExpire = (await this.redis.ttl(key)) * 1000;

    // If over limit, set block key
    if (blockDuration > 0) {
      await this.redis.set(blockKey, '1', {
        ttlSeconds: Math.ceil(blockDuration / 1000),
      });
    }

    return {
      totalHits,
      timeToExpire: Math.max(timeToExpire, 0),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
