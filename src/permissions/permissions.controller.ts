import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { PermissionCode } from '../common/constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsService } from './permissions.service';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions(PermissionCode.PermissionRead)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.findAll(user.sub);
  }
}
