import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';

@Catch(BadRequestException)
export class LocalValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json?: (body: unknown) => void; send?: (body: unknown) => void };
    }>();
    const body = exception.getResponse();
    const payload = {
      code: 'LOCAL_VALIDATION_FAILED',
      message: 'The scoped validation filter handled this error.',
      details: body,
      timestamp: new Date().toISOString(),
    };

    const reply = response.status(400);
    if (reply.json) {
      reply.json(payload);
      return;
    }
    reply.send?.(payload);
  }
}
