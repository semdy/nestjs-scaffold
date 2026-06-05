export class SkipMessageError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'SkipMessageError';
  }
}
