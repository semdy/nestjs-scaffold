import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [AccessModule, TenancyModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
})
export class PermissionsModule {}
