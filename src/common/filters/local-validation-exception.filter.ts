import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { tenantStore } from '../../tenancy/tenancy-context.service';

@Catch(BadRequestException)
export class LocalValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ url?: string; method?: string }>();
    const response = ctx.getResponse<unknown>();
    const body = exception.getResponse();
    const store = tenantStore.getStore();

    const payload = {
      statusCode: 400,
      message:
        typeof body === 'object' && body !== null && 'message' in body
          ? body.message
          : 'Validation failed',
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      details: body,
      path: request.url,
      method: request.method,
      requestId: store?.requestId,
      tenantId: store?.tenantId,
      timestamp: new Date().toISOString(),
    };

    const reply = response as {
      statusCode?: number;
      status?: (code: number) => { json?: (body: unknown) => void; send?: (body: unknown) => void };
      json?: (body: unknown) => void;
      send?: (body: unknown) => void;
    };
    const res = reply.status?.(400) ?? reply;
    if (res.json) {
      res.json(payload);
      return;
    }
    res.send?.(payload);
  }
}
