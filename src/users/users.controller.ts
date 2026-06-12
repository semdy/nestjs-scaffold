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
import { Roles } from '../common/decorators/roles.decorator';
import { LocalValidationExceptionFilter } from '../common/filters/local-validation-exception.filter';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('admin')
  @UseFilters(LocalValidationExceptionFilter)
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersService.create(dto));
  }

  @Get()
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAllForTenant();
    return users.map((user) => UserResponseDto.fromEntity(user));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersService.findByIdForTenant(id));
  }

  @Patch(':id')
  @Roles('admin')
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

  @Delete(':id')
  @Roles('admin')
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
