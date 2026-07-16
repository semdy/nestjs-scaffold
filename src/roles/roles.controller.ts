import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/constants';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ToggleRolePermissionDto } from './dto/toggle-role-permission.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(PermissionCode.RoleRead)
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @Permissions(PermissionCode.RoleRead)
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Get(':id/permissions')
  @Permissions(PermissionCode.PermissionRead)
  getPermissionMatrix(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.getPermissionMatrix(id, user.sub);
  }

  @Post()
  @Permissions(PermissionCode.RoleCreate)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.create(dto, user.sub);
  }

  @Patch(':id')
  @Permissions(PermissionCode.RoleUpdate)
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Put(':id/permissions')
  @Permissions(PermissionCode.RoleAssignPermissions)
  setPermissions(
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.setPermissions(id, dto.permissionIds, user.sub);
  }

  @Patch(':id/permissions/:permissionId')
  @Permissions(PermissionCode.RoleAssignPermissions)
  setPermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @Body() dto: ToggleRolePermissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.setPermission(id, permissionId, dto.enabled, user.sub);
  }

  @Delete(':id')
  @Permissions(PermissionCode.RoleDelete)
  async remove(@Param('id') id: string) {
    await this.rolesService.remove(id);
    return { deleted: true as const };
  }
}
