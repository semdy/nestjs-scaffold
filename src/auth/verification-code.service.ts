import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import {
  VERIFICATION_CODE_DELIVERY,
  VerificationCodeDeliveryProvider,
} from '../notification/verification-code-delivery.provider';

export type VerificationChannel = 'email' | 'phone';

@Injectable()
export class VerificationCodeService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(VERIFICATION_CODE_DELIVERY)
    private readonly delivery: VerificationCodeDeliveryProvider,
  ) {}

  async send(channel: VerificationChannel, target: string): Promise<void> {
    const cooldown = this.config.get<number>('VERIFY_CODE_COOLDOWN_SECONDS', 60);
    const allowed = await this.redis.set(this.cooldownKey(channel, target), '1', {
      ttlSeconds: cooldown,
      nx: true,
    });
    if (!allowed) throw new ConflictException('Verification code was sent too recently');

    const code =
      this.config.get<string>('VERIFY_CODE_FIXED') ??
      String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.set(this.codeKey(channel, target), this.hash(code), {
      ttlSeconds: this.config.get<number>('VERIFY_CODE_TTL_SECONDS', 300),
    });

    try {
      await this.delivery.deliver(channel, target, code);
    } catch (error) {
      await this.redis.delete(this.codeKey(channel, target), this.cooldownKey(channel, target));
      throw error;
    }
  }

  async consume(channel: VerificationChannel, target: string, code: string): Promise<void> {
    const key = this.codeKey(channel, target);
    const candidate = this.hash(code);
    await this.redis.ensureConnected();
    const consumed = await this.redis.client.eval(
      `local value = redis.call('GET', KEYS[1])
       if value and value == ARGV[1] then
         redis.call('DEL', KEYS[1])
         return 1
       end
       return 0`,
      1,
      key,
      candidate,
    );
    if (consumed !== 1) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }
  }

  private hash(code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(code)
      .digest('hex');
  }

  private codeKey(channel: VerificationChannel, target: string): string {
    return `verify:code:${channel}:${target}`;
  }

  private cooldownKey(channel: VerificationChannel, target: string): string {
    return `verify:cooldown:${channel}:${target}`;
  }
}
