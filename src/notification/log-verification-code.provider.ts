import { Logger } from '@nestjs/common';
import {
  VerificationCodeChannel,
  VerificationCodeDeliveryProvider,
} from './verification-code-delivery.provider';

export class LogVerificationCodeProvider implements VerificationCodeDeliveryProvider {
  private readonly logger = new Logger(LogVerificationCodeProvider.name);

  async deliver(channel: VerificationCodeChannel, target: string, code: string): Promise<void> {
    this.logger.log(`Verification code for ${channel}:${target} is ${code}`);
  }
}
