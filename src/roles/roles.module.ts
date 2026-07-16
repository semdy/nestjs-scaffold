import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AccessModule, TenancyModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
