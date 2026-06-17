import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/authenticated-user.interface';
import { TenancyContext } from '../../tenancy/tenancy-context.service';
import { TENANT_REQUIRED_KEY } from '../constants';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenancyContext: TenancyContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const tenantRequired =
      this.reflector.getAllAndOverride<boolean>(TENANT_REQUIRED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? true;

    if (!tenantRequired) {
      return true;
    }

    const tenantId = this.tenancyContext.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant header is required');
    }

    // JWT 中已包含 tenantId，交叉校验防止跨租户访问。
    // 租户存在性/活跃性不在此处查 DB——已认证用户的 JWT 在登录时签发，
    // 停用租户的用户无法登录也无法 refresh，窗口期不超过 access token 有效期。
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.tenantId && request.user.tenantId !== tenantId) {
      throw new ForbiddenException('Token tenant does not match request tenant');
    }

    return true;
  }
}
