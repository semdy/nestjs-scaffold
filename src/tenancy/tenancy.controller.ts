import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantRequired } from '../common/decorators/tenant-required.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenancyService } from './tenancy.service';

@ApiTags('tenants')
@Controller('tenants')
@Roles('system_admin')
@TenantRequired(false)
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get()
  @ApiOperation({
    summary: 'List tenants',
    description: 'Returns active tenants. Pass ?includeInactive=true to list all.',
  })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Tenant list', type: [TenantResponseDto] })
  async findAll(@Query('includeInactive') includeInactive?: string): Promise<TenantResponseDto[]> {
    const tenants = await this.tenancyService.findAll(includeInactive === 'true');
    return tenants.map((t) => TenantResponseDto.fromEntity(t));
  }

  @Post()
  @ApiOperation({ summary: 'Create tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created', type: TenantResponseDto })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async create(@Body() dto: CreateTenantDto): Promise<TenantResponseDto> {
    return TenantResponseDto.fromEntity(await this.tenancyService.create(dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findOne(@Param('id') id: string): Promise<TenantResponseDto> {
    return TenantResponseDto.fromEntity(await this.tenancyService.findById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant updated', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto): Promise<TenantResponseDto> {
    return TenantResponseDto.fromEntity(await this.tenancyService.update(id, dto));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete tenant',
    description:
      'Soft delete (set inactive + Redis blacklist) by default. Pass ?hard=true for physical deletion.',
  })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiQuery({
    name: 'hard',
    required: false,
    type: Boolean,
    description: 'Permanently delete the record',
  })
  @ApiResponse({ status: 200, description: 'Tenant deleted' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async remove(@Param('id') id: string, @Query('hard') hard?: string): Promise<{ deleted: true }> {
    await this.tenancyService.remove(id, hard === 'true');
    return { deleted: true };
  }
}
