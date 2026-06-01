import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { TenantRequired } from './common/decorators/tenant-required.decorator';

@ApiTags('app')
@Controller()
export class AppController {
  @Get()
  @Public()
  @TenantRequired(false)
  root() {
    return {
      name: 'nestjs-production-scaffold',
      docs: '/api/docs',
      health: '/api/health',
    };
  }
}
