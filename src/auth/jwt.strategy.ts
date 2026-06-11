import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './authenticated-user.interface';
import { RedisService } from '../redis/redis.service';

const LAST_LOGOUT_PREFIX = 'lastLogoutAt:';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AuthenticatedUser): Promise<AuthenticatedUser> {
    if (!payload.active) {
      throw new UnauthorizedException('User is inactive');
    }

    if (payload.iat) {
      const lastLogoutAt = await this.redis.get(`${LAST_LOGOUT_PREFIX}${payload.sub}`);
      if (lastLogoutAt && payload.iat < Number(lastLogoutAt)) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return payload;
  }
}
