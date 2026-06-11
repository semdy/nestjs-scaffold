import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { TenancyService } from './tenancy.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get(':id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get tenant details',
    description: 'Returns the tenant if it exists and is active.',
  })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found or inactive' })
  async getTenant(@Param('id') id: string): Promise<TenantResponseDto> {
    return TenantResponseDto.fromEntity(await this.tenancyService.findActiveTenant(id));
  }

  @Post(':id/deactivate')
  @Roles('admin')
  @ApiOperation({
    summary: 'Deactivate a tenant',
    description: 'Deactivates the tenant and blacklists all existing access tokens via Redis.',
  })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant deactivated' })
  @ApiResponse({ status: 404, description: 'Tenant not found or already inactive' })
  async deactivateTenant(@Param('id') id: string): Promise<{ deactivated: true }> {
    await this.tenancyService.deactivateTenant(id);
    return { deactivated: true };
  }
}
