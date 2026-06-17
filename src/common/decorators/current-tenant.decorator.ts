import { createParamDecorator } from '@nestjs/common';
import { tenantStore } from '../../tenancy/tenancy-context.service';

export const CurrentTenant = createParamDecorator((): string | undefined => {
  return tenantStore.getStore()?.tenantId;
});
