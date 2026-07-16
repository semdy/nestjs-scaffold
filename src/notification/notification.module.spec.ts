import { ConfigService } from '@nestjs/config';
import { AliyunVerificationCodeProvider } from './aliyun-verification-code.provider';
import { LogVerificationCodeProvider } from './log-verification-code.provider';
import { createVerificationCodeDeliveryProvider } from './notification.module';
import { WebhookVerificationCodeProvider } from './webhook-verification-code.provider';

describe('verification code delivery provider factory', () => {
  const config = (values: Record<string, string>) =>
    ({
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    }) as unknown as ConfigService;

  it('uses log delivery by default outside production', () => {
    expect(createVerificationCodeDeliveryProvider(config({}))).toBeInstanceOf(
      LogVerificationCodeProvider,
    );
  });

  it('auto-detects the configured webhook', () => {
    expect(
      createVerificationCodeDeliveryProvider(
        config({ VERIFY_CODE_DELIVERY_WEBHOOK_URL: 'https://notify.example.com/code' }),
      ),
    ).toBeInstanceOf(WebhookVerificationCodeProvider);
  });

  it('creates the Aliyun provider when all required settings exist', () => {
    expect(
      createVerificationCodeDeliveryProvider(
        config({
          VERIFY_CODE_PROVIDER: 'aliyun',
          ALIBABA_CLOUD_ACCESS_KEY_ID: 'id',
          ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'secret',
          ALIYUN_SMS_SIGN_NAME: 'Example',
          ALIYUN_SMS_TEMPLATE_CODE: 'SMS_123456789',
          ALIYUN_MAIL_FROM_ADDRESS: 'noreply@example.com',
        }),
      ),
    ).toBeInstanceOf(AliyunVerificationCodeProvider);
  });

  it('fails fast when production delivery is not configured', () => {
    expect(() =>
      createVerificationCodeDeliveryProvider(config({ NODE_ENV: 'production' })),
    ).toThrow('A verification code delivery provider is required in production');
  });
});
