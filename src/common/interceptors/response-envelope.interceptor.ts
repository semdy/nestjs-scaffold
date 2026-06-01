import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ requestId?: string }>();

    return (next.handle() as Observable<unknown>).pipe(
      map((data: unknown) => ({
        success: true,
        requestId: request.requestId,
        data,
      })),
    );
  }
}
