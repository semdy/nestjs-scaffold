import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  requestId: string;
  tenantId?: string;
}

@Injectable()
export class TenancyContext {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  get tenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  requireTenantId(): string {
    const tenantId = this.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is missing');
    }
    return tenantId;
  }
}
