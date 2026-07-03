import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenancyContext } from '../../tenancy/tenancy-context.service';
import { TENANT_REQUIRED_KEY } from '../constants';
import { HttpRequestContext } from '../interfaces/http-request.interface';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenancyContext: TenancyContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequestContext>();
    const tenantRequired =
      this.reflector.getAllAndOverride<boolean>(TENANT_REQUIRED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? true;

    if (!tenantRequired) {
      return true;
    }

    const headerTenantId = this.tenancyContext.tenantId;
    const tokenTenantId = request.user?.tenantId;

    // JWT 中已包含 tenantId，交叉校验防止跨租户访问。
    // 租户存在性/活跃性不在此处查 DB——已认证用户的 JWT 在登录时签发，
    // 停用租户的用户无法登录也无法 refresh，窗口期不超过 access token 有效期。
    if (tokenTenantId) {
      if (headerTenantId && headerTenantId !== tokenTenantId) {
        throw new ForbiddenException('Token tenant does not match request tenant');
      }

      this.tenancyContext.setTenantId(tokenTenantId);
      request.tenantId = tokenTenantId;
      return true;
    }

    if (!headerTenantId) {
      throw new ForbiddenException('Tenant is required');
    }

    return true;
  }
}
