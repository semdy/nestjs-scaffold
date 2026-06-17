import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  requestId: string;
  tenantId?: string;
}

export const tenantStore = new AsyncLocalStorage<TenantStore>();

@Injectable()
export class TenancyContext {
  run<T>(store: TenantStore, callback: () => T): T {
    return tenantStore.run(store, callback);
  }

  get tenantId(): string | undefined {
    return tenantStore.getStore()?.tenantId;
  }

  get requestId(): string | undefined {
    return tenantStore.getStore()?.requestId;
  }

  requireTenantId(): string {
    const tenantId = this.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is missing');
    }
    return tenantId;
  }
}
