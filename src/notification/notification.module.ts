import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AliyunVerificationCodeConfig,
  AliyunVerificationCodeProvider,
} from './aliyun-verification-code.provider';
import { LogVerificationCodeProvider } from './log-verification-code.provider';
import {
  VERIFICATION_CODE_DELIVERY,
  VerificationCodeDeliveryProvider,
} from './verification-code-delivery.provider';
import { WebhookVerificationCodeProvider } from './webhook-verification-code.provider';
import { EmailTemplateService } from './email-template.service';

type ProviderName = 'aliyun' | 'webhook' | 'log';

function requireConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) throw new Error(`${key} is required for the selected verification code provider`);
  return value;
}

export function createVerificationCodeDeliveryProvider(
  config: ConfigService,
  templates = new EmailTemplateService(),
): VerificationCodeDeliveryProvider {
  const configured = config.get<ProviderName>('VERIFY_CODE_PROVIDER');
  const provider =
    configured ??
    (config.get<string>('ALIBABA_CLOUD_ACCESS_KEY_ID')
      ? 'aliyun'
      : config.get<string>('VERIFY_CODE_DELIVERY_WEBHOOK_URL')
        ? 'webhook'
        : 'log');

  if (provider === 'aliyun') {
    const aliyunConfig: AliyunVerificationCodeConfig = {
      accessKeyId: requireConfig(config, 'ALIBABA_CLOUD_ACCESS_KEY_ID'),
      accessKeySecret: requireConfig(config, 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'),
      smsSignName: requireConfig(config, 'ALIYUN_SMS_SIGN_NAME'),
      smsTemplateCode: requireConfig(config, 'ALIYUN_SMS_TEMPLATE_CODE'),
      mailFromAddress: requireConfig(config, 'ALIYUN_MAIL_FROM_ADDRESS'),
      mailFromName:
        config.get<string>('ALIYUN_MAIL_FROM_NAME')?.trim() ||
        config.get<string>('APP_NAME', 'nestjs-scaffold'),
      appName: config.get<string>('APP_NAME', 'nestjs-scaffold'),
      codeTtlMinutes: Math.ceil(config.get<number>('VERIFY_CODE_TTL_SECONDS', 300) / 60),
    };
    return new AliyunVerificationCodeProvider(aliyunConfig, undefined, templates);
  }

  if (provider === 'webhook') {
    return new WebhookVerificationCodeProvider(
      requireConfig(config, 'VERIFY_CODE_DELIVERY_WEBHOOK_URL'),
    );
  }

  if (config.get<string>('NODE_ENV', 'development') === 'production') {
    throw new Error('A verification code delivery provider is required in production');
  }
  return new LogVerificationCodeProvider();
}

@Module({
  providers: [
    EmailTemplateService,
    {
      provide: VERIFICATION_CODE_DELIVERY,
      inject: [ConfigService, EmailTemplateService],
      useFactory: createVerificationCodeDeliveryProvider,
    },
  ],
  exports: [VERIFICATION_CODE_DELIVERY],
})
export class NotificationModule {}
