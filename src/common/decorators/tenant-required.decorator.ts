import { SetMetadata } from '@nestjs/common';
import { TENANT_REQUIRED_KEY } from '../constants';

export const TenantRequired = (required = true) => SetMetadata(TENANT_REQUIRED_KEY, required);
