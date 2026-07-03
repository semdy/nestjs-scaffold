import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/authenticated-user.interface';
import { HttpRequestContext } from '../interfaces/http-request.interface';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<HttpRequestContext>();
    return request.user;
  },
);
