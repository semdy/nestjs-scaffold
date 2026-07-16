import { ServiceUnavailableException } from '@nestjs/common';
import {
  VerificationCodeChannel,
  VerificationCodeDeliveryProvider,
} from './verification-code-delivery.provider';

export class WebhookVerificationCodeProvider implements VerificationCodeDeliveryProvider {
  constructor(private readonly url: string) {}

  async deliver(channel: VerificationCodeChannel, target: string, code: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel, target, code }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Verification code provider rejected delivery');
    }
  }
}
