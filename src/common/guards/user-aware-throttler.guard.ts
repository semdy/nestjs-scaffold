import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  /**
   * 限流标识：已认证用户按 userId，未认证请求按 IP。
   * 登录接口（@Public）按 IP 防暴力破解，业务接口按用户限流不互相影响。
   * req.ip 在 Express 和 Fastify 4+ 中都兼容。
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { id?: string } | undefined;
    if (user?.id) {
      return `user:${user.id}`;
    }
    return `ip:${(req['ip'] as string) ?? 'unknown'}`;
  }

  /**
   * 自定义错误消息，带重试时间。
   */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfter = Math.ceil(throttlerLimitDetail.ttl / 1000);
    throw new HttpException(
      `Too Many Requests. Retry after ${retryAfter} seconds.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
