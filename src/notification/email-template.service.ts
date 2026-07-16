import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const definitions = {
  'verification-code': {
    subject: '{{appName}} verification code',
    file: 'verification-code.hbs',
  },
} as const;

export type EmailTemplateName = keyof typeof definitions;

export interface RenderedEmail {
  subject: string;
  html: string;
}

@Injectable()
export class EmailTemplateService {
  private readonly compiled = new Map<EmailTemplateName, Handlebars.TemplateDelegate>();

  render(name: EmailTemplateName, variables: Record<string, unknown>): RenderedEmail {
    const definition = definitions[name];
    let template = this.compiled.get(name);
    if (!template) {
      const source = readFileSync(join(__dirname, 'templates', definition.file), 'utf8');
      template = Handlebars.compile(source, { strict: true });
      this.compiled.set(name, template);
    }
    return {
      subject: Handlebars.compile(definition.subject, { strict: true })(variables),
      html: template(variables),
    };
  }
}
