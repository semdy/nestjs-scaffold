import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenancyContext } from './tenancy-context.service';
import { TenancyController } from './tenancy.controller';
import { TenancyService } from './tenancy.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenancyController],
  providers: [TenancyContext, TenancyService],
  exports: [TenancyContext, TenancyService, TypeOrmModule],
})
export class TenancyModule {}
