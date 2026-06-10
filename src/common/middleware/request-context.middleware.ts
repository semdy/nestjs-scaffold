import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { TenancyContext } from '../../tenancy/tenancy-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
  ) {}

  use(
    req: IncomingMessage & { requestId?: string; tenantId?: string },
    res: ServerResponse & { setHeader?: (name: string, value: string) => void },
    next: () => void,
  ): void {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const tenantHeader = this.configService.get<string>('app.tenantHeader', 'x-tenant-id');
    const rawTenantId = req.headers[tenantHeader] as string | undefined;
    const tenantId = rawTenantId?.trim();

    req.requestId = requestId;
    req.tenantId = tenantId;
    res.setHeader?.('x-request-id', requestId);

    this.tenancyContext.run({ requestId, tenantId }, next);
  }
}
