import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { TenancyContext } from '../../tenancy/tenancy-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request & { requestId?: string; tenantId?: string }, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const tenantHeader = this.configService.get<string>('app.tenantHeader', 'x-tenant-id');
    const tenantId = req.headers[tenantHeader] as string | undefined;

    req.requestId = requestId;
    req.tenantId = tenantId;
    res.setHeader('x-request-id', requestId);

    this.tenancyContext.run({ requestId, tenantId }, next);
  }
}
