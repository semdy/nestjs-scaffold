import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const IDEMPOTENCY_PREFIX = 'event:processed:';
const PROCESSING_PREFIX = 'event:processing:';
const DEFAULT_TTL_SECONDS = 86400 * 7; // 7天
const PROCESSING_TTL_SECONDS = 300; // 单条消息最长处理窗口

@Injectable()
export class IdempotencyService {
  constructor(private readonly redisService: RedisService) {}

  async isProcessed(eventId: string, routingKey: string): Promise<boolean> {
    return this.redisService.exists(this.processedKey(eventId, routingKey));
  }

  async markProcessed(eventId: string, routingKey: string): Promise<void> {
    await this.redisService.set(this.processedKey(eventId, routingKey), '1', {
      ttlSeconds: DEFAULT_TTL_SECONDS,
    });
  }

  async acquireProcessingLock(eventId: string, routingKey: string): Promise<boolean> {
    // SET NX：仅在 key 不存在时设置成功
    return this.redisService.set(this.processingKey(eventId, routingKey), '1', {
      ttlSeconds: PROCESSING_TTL_SECONDS,
      nx: true,
    });
  }

  async releaseProcessingLock(eventId: string, routingKey: string): Promise<void> {
    await this.redisService.delete(this.processingKey(eventId, routingKey));
  }

  private processedKey(eventId: string, routingKey: string): string {
    return `${IDEMPOTENCY_PREFIX}${routingKey}:${eventId}`;
  }

  private processingKey(eventId: string, routingKey: string): string {
    return `${PROCESSING_PREFIX}${routingKey}:${eventId}`;
  }
}
