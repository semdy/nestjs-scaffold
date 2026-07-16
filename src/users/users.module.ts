import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AccessModule } from '../access/access.module';
import { RolesModule } from '../roles/roles.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TenancyModule, AccessModule, RolesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
