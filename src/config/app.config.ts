import { registerAs } from '@nestjs/config';

const csv = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const appConfig = registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'nestjs-production-scaffold',
  port: Number(process.env.APP_PORT ?? 3000),
  adapter: (process.env.HTTP_ADAPTER ?? 'express') as 'express' | 'fastify',
  globalPrefix: process.env.GLOBAL_PREFIX ?? 'api',
  corsOrigins: csv(process.env.CORS_ORIGINS ?? '*'),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  swaggerPath: process.env.SWAGGER_PATH ?? 'docs',
  openapiExport: process.env.OPENAPI_EXPORT !== 'false',
  tenantHeader: (process.env.TENANT_HEADER ?? 'x-tenant-id').toLowerCase(),
}));
