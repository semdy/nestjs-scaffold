import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { LocalValidationExceptionFilter } from '../common/filters/local-validation-exception.filter';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';
import { SetUserRolesDto } from './dto/set-user-roles.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions(PermissionCode.UserCreate)
  @UseFilters(LocalValidationExceptionFilter)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersService.create(dto, actor.sub));
  }

  @Get()
  @Permissions(PermissionCode.UserRead)
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAllForTenant();
    return users.map((user) => UserResponseDto.fromEntity(user));
  }

  @Get(':id')
  @Permissions(PermissionCode.UserRead)
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersService.findByIdForTenant(id));
  }

  @Patch(':id')
  @Permissions(PermissionCode.UserUpdate)
  @UseFilters(LocalValidationExceptionFilter)
  @ApiOperation({
    summary: 'Update user',
    description: 'Partially update user fields. Only admin can change roles.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated', type: UserResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersService.update(id, dto));
  }

  @Patch(':id/roles')
  @Permissions(PermissionCode.UserAssignRoles)
  async setRoles(
    @Param('id') id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersService.setRoles(id, dto.roleIds, actor.sub));
  }

  @Delete(':id')
  @Permissions(PermissionCode.UserDelete)
  @ApiOperation({
    summary: 'Delete user',
    description: 'Soft delete (set inactive) by default. Pass ?hard=true for physical deletion.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({
    name: 'hard',
    required: false,
    type: Boolean,
    description: 'Permanently delete the record',
  })
  @ApiResponse({ status: 200, description: 'User deleted' })
  async remove(@Param('id') id: string, @Query('hard') hard?: string): Promise<{ deleted: true }> {
    await this.usersService.remove(id, hard === 'true');
    return { deleted: true };
  }
}
