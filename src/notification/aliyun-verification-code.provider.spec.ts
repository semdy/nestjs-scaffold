import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AliyunVerificationCodeProvider } from './aliyun-verification-code.provider';

describe('AliyunVerificationCodeProvider', () => {
  const config = {
    accessKeyId: 'test-id',
    accessKeySecret: 'test-secret',
    smsSignName: 'Example App',
    smsTemplateCode: 'SMS_123456789',
    mailFromAddress: 'noreply@example.com',
    mailFromName: 'Example App',
    appName: 'Example App',
    codeTtlMinutes: 5,
  };

  it('sends the verification code through Aliyun SMS template parameters', async () => {
    const sms = { sendSms: jest.fn().mockResolvedValue({ body: { code: 'OK' } }) };
    const mail = { singleSendMail: jest.fn() };
    const provider = new AliyunVerificationCodeProvider(config, {
      sms: sms,
      mail: mail,
    });

    await provider.deliver('phone', '+8613800138000', '123456');

    expect(sms.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumbers: '+8613800138000',
        signName: 'Example App',
        templateCode: 'SMS_123456789',
        templateParam: '{"code":"123456"}',
      }),
    );
    expect(mail.singleSendMail).not.toHaveBeenCalled();
  });

  it('sends an HTML verification email through Aliyun DirectMail', async () => {
    const sms = { sendSms: jest.fn() };
    const mail = { singleSendMail: jest.fn().mockResolvedValue({ body: { requestId: '1' } }) };
    const provider = new AliyunVerificationCodeProvider(config, {
      sms: sms,
      mail: mail,
    });

    await provider.deliver('email', 'user@example.com', '654321');

    expect(mail.singleSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        accountName: 'noreply@example.com',
        fromAlias: 'Example App',
        toAddress: 'user@example.com',
        subject: 'Example App verification code',
        htmlBody: expect.stringContaining('654321') as string,
      }),
    );
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('does not expose Aliyun failures to API callers', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const provider = new AliyunVerificationCodeProvider(config, {
      sms: {
        sendSms: jest.fn().mockResolvedValue({ body: { code: 'isv.BUSINESS_LIMIT_CONTROL' } }),
      },
      mail: { singleSendMail: jest.fn() },
    });

    await expect(provider.deliver('phone', '+8613800138000', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    log.mockRestore();
  });
});
