import { Module } from '@nestjs/common';
import { TenancyContext } from './tenancy-context.service';
import { TenancyController } from './tenancy.controller';
import { TenancyService } from './tenancy.service';

@Module({
  controllers: [TenancyController],
  providers: [TenancyContext, TenancyService],
  exports: [TenancyContext, TenancyService],
})
export class TenancyModule {}
