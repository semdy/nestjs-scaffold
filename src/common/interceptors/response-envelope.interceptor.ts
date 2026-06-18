import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { TenancyContext } from '../../tenancy/tenancy-context.service';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly tenancyContext: TenancyContext) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return (next.handle() as Observable<unknown>).pipe(
      map((data: unknown) => ({
        success: true,
        requestId: this.tenancyContext.requestId,
        data,
      })),
    );
  }
}
