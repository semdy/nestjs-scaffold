import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const IDEMPOTENCY_PREFIX = 'event:processed:';
const DEFAULT_TTL_SECONDS = 86400 * 7; // 7天

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * 检查并标记事件是否已处理。
   * 返回 true = 重复消息，应跳过；false = 首次处理
   */
  async isDuplicate(eventId: string, routingKey: string): Promise<boolean> {
    const key = `${IDEMPOTENCY_PREFIX}${routingKey}:${eventId}`;
    // SET NX：仅在 key 不存在时设置成功
    const isNew = await this.redisService.set(key, '1', {
      ttlSeconds: DEFAULT_TTL_SECONDS,
      nx: true,
    });
    return !isNew; // set 返回 false 说明 key 已存在 → 重复
  }
}
