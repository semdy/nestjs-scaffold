import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { TenancyContext } from '../../tenancy/tenancy-context.service';
import { TenancyService } from '../../tenancy/tenancy.service';

const SKIP_SUBDOMAINS = new Set(['api', 'www', 'app', 'admin']);

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly tenancyService: TenancyService,
    private readonly configService: ConfigService,
  ) {}

  async use(
    req: IncomingMessage & { requestId?: string; tenantId?: string },
    res: ServerResponse & { setHeader?: (name: string, value: string) => void },
    next: () => void,
  ): Promise<void> {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const tenantHeader = this.configService.get<string>('app.tenantHeader', 'x-tenant-id');

    // 子域名解析模式：从 Host 提取 subdomain slug → Redis/DB 查 tenant UUID
    const mode = this.configService.get<'header' | 'subdomain'>('app.tenantResolution', 'header');
    if (mode === 'subdomain') {
      const subdomain = this.extractSubdomain(req.headers.host);
      if (subdomain) {
        const resolved = await this.tenancyService.resolveTenantId(subdomain);
        if (resolved) {
          req.headers[tenantHeader] = resolved;
        }
      }
    }

    const rawTenantId = req.headers[tenantHeader] as string | undefined;
    const tenantId = rawTenantId?.trim();

    req.requestId = requestId;
    req.tenantId = tenantId;
    res.setHeader?.('x-request-id', requestId);

    this.tenancyContext.run({ requestId, tenantId }, next);
  }

  private extractSubdomain(host?: string): string | null {
    if (!host) {
      return null;
    }
    // 去掉端口号
    const hostname = host.split(':')[0] ?? '';
    const parts = hostname.split('.');
    // localhost 或单段域名无子域名
    if (parts.length < 2) {
      return null;
    }
    const candidate = parts[0] ?? '';
    if (!candidate || SKIP_SUBDOMAINS.has(candidate)) {
      return null;
    }
    return candidate;
  }
}
