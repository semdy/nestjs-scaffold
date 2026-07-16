import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService', () => {
  it('renders the verification email and escapes variables', () => {
    const email = new EmailTemplateService().render('verification-code', {
      appName: 'Example App',
      code: '<123456>',
      expiresInMinutes: 5,
    });

    expect(email.subject).toBe('Example App verification code');
    expect(email.html).toContain('&lt;123456&gt;');
    expect(email.html).not.toContain('<123456>');
    expect(email.html).toMatch(/5\s+minutes/);
  });
});
