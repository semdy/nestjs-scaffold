import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string; tenantId?: string }>();
    const response = ctx.getResponse<unknown>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = typeof exceptionResponse === 'object' && exceptionResponse !== null ? exceptionResponse : {};
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (payload as { message?: unknown }).message ?? 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body = {
      statusCode: status,
      message,
      error: (payload as { error?: string }).error,
      code: (payload as { code?: string }).code,
      details: (payload as { details?: unknown }).details,
      path: request.url,
      method: request.method,
      requestId: request.requestId,
      tenantId: request.tenantId,
      timestamp: new Date().toISOString(),
    };

    this.httpAdapterHost.httpAdapter.reply(response, body, status);
  }
}
