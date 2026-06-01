import { HttpException, HttpStatus } from '@nestjs/common';

export class DomainException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly code = 'DOMAIN_ERROR',
    public readonly details?: Record<string, unknown>,
  ) {
    super({ message, code, details }, status);
  }
}
