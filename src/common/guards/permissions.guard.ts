import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from '../../access/access.service';
import { PERMISSIONS_KEY, PermissionCodeValue, SYSTEM_ADMIN_ROLE } from '../constants';
import { HttpRequestContext } from '../interfaces/http-request.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionCodeValue[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<HttpRequestContext>().user;
    if (!user) throw new ForbiddenException('Authentication is required');

    const access = await this.accessService.getUserAccess(user.sub, user.tenantId);
    if (access.roles.includes(SYSTEM_ADMIN_ROLE)) return true;
    if (!required.some((permission) => access.permissions.includes(permission))) {
      throw new ForbiddenException('Insufficient permission');
    }
    return true;
  }
}
