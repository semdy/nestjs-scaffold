import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { PermissionCode } from '../common/constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
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

  @Get(':id')
  @Roles('system_admin')
  @Permissions(PermissionCode.PermissionRead)
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Post()
  @Roles('system_admin')
  @Permissions(PermissionCode.PermissionCreate)
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  @Roles('system_admin')
  @Permissions(PermissionCode.PermissionUpdate)
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('system_admin')
  @Permissions(PermissionCode.PermissionDelete)
  async remove(@Param('id') id: string) {
    await this.permissionsService.remove(id);
    return { deleted: true as const };
  }
}
