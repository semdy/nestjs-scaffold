import { Logger, ServiceUnavailableException } from '@nestjs/common';
import Dm20151123, { SingleSendMailRequest } from '@alicloud/dm20151123';
import Dysmsapi20170525, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { Config } from '@alicloud/openapi-client';
import {
  VerificationCodeChannel,
  VerificationCodeDeliveryProvider,
} from './verification-code-delivery.provider';
import { EmailTemplateService } from './email-template.service';

export interface AliyunVerificationCodeConfig {
  accessKeyId: string;
  accessKeySecret: string;
  smsSignName: string;
  smsTemplateCode: string;
  mailFromAddress: string;
  mailFromName: string;
  appName: string;
  codeTtlMinutes: number;
}

interface AliyunClients {
  sms: Pick<Dysmsapi20170525, 'sendSms'>;
  mail: Pick<Dm20151123, 'singleSendMail'>;
}

export class AliyunVerificationCodeProvider implements VerificationCodeDeliveryProvider {
  private readonly logger = new Logger(AliyunVerificationCodeProvider.name);
  private readonly clients: AliyunClients;

  constructor(
    private readonly config: AliyunVerificationCodeConfig,
    clients?: AliyunClients,
    private readonly templates = new EmailTemplateService(),
  ) {
    this.clients = clients ?? this.createClients();
  }

  async deliver(channel: VerificationCodeChannel, target: string, code: string): Promise<void> {
    if (channel === 'phone') {
      await this.sendSms(target, code);
      return;
    }
    await this.sendEmail(target, code);
  }

  private createClients(): AliyunClients {
    const credentials = {
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
    };
    return {
      sms: new Dysmsapi20170525(new Config({ ...credentials, endpoint: 'dysmsapi.aliyuncs.com' })),
      mail: new Dm20151123(new Config({ ...credentials, endpoint: 'dm.aliyuncs.com' })),
    };
  }

  private async sendSms(target: string, code: string): Promise<void> {
    try {
      const response = await this.clients.sms.sendSms(
        new SendSmsRequest({
          phoneNumbers: target,
          signName: this.config.smsSignName,
          templateCode: this.config.smsTemplateCode,
          templateParam: JSON.stringify({ code }),
        }),
      );
      if (response.body?.code !== 'OK') {
        throw new Error(`Aliyun SMS API returned ${response.body?.code ?? 'an empty code'}`);
      }
    } catch (error) {
      this.logger.error(
        `Aliyun SMS delivery failed for ${this.maskTarget(target)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('SMS delivery failed');
    }
  }

  private async sendEmail(target: string, code: string): Promise<void> {
    try {
      const email = this.templates.render('verification-code', {
        appName: this.config.appName,
        code,
        expiresInMinutes: this.config.codeTtlMinutes,
      });
      const response = await this.clients.mail.singleSendMail(
        new SingleSendMailRequest({
          accountName: this.config.mailFromAddress,
          addressType: 1,
          fromAlias: this.config.mailFromName,
          replyToAddress: true,
          toAddress: target,
          subject: email.subject,
          htmlBody: email.html,
        }),
      );
      if (!response.body) throw new Error('Aliyun DirectMail API returned an empty response');
    } catch (error) {
      this.logger.error(
        `Aliyun email delivery failed for ${this.maskTarget(target)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    }
  }

  private maskTarget(target: string): string {
    if (target.includes('@')) {
      const [local, domain] = target.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    return `${target.slice(0, 4)}***${target.slice(-4)}`;
  }
}
