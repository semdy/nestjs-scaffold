import { mkdirSync, writeFileSync } from 'node:fs';
import { ClassSerializerInterceptor, Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

type App = NestExpressApplication | NestFastifyApplication;

async function createNestApp(): Promise<App> {
  const adapter = process.env.HTTP_ADAPTER ?? 'express';

  if (adapter === 'fastify') {
    return NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
    );
  }

  return NestFactory.create<NestExpressApplication>(AppModule);
}

async function configureSecurity(app: App, configService: ConfigService): Promise<void> {
  const corsOrigins = configService.get<string[]>('app.corsOrigins', ['*']);
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });

  if ('register' in app) {
    const [{ default: fastifyHelmet }, { default: fastifyCompress }] = await Promise.all([
      import('@fastify/helmet'),
      import('@fastify/compress'),
    ]);
    // Nest's Fastify adapter and plugins may resolve compatible Fastify patch versions
    // with distinct TypeScript identities. The runtime plugin contracts remain identical.
    await app.register(fastifyHelmet as never);
    await app.register(fastifyCompress as never);
    return;
  }

  app.use(helmet());
  app.use(compression());
}

async function bootstrap() {
  const app = await createNestApp();
  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);
  const logger = new Logger('Bootstrap');

  await configureSecurity(app, configService);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));
  app.enableShutdownHooks();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const globalPrefix = configService.get<string>('app.globalPrefix', 'api');
  if (globalPrefix) {
    app.setGlobalPrefix(globalPrefix);
  }

  const swaggerEnabled = configService.get<boolean>('app.swaggerEnabled', true);
  const openapiExport = configService.get<boolean>('app.openapiExport', false);

  if (swaggerEnabled || openapiExport) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(configService.get<string>('app.name', 'NestJS API'))
        .setDescription('NestJS scaffold API')
        .setVersion('1.0')
        .addBearerAuth()
        .addApiKey(
          { type: 'apiKey', name: configService.get<string>('app.tenantHeader') },
          'tenant',
        )
        .addSecurityRequirements('bearer')
        .addSecurityRequirements('tenant')
        .build(),
    );

    if (swaggerEnabled) {
      SwaggerModule.setup(
        `${globalPrefix}/${configService.get<string>('app.swaggerPath', 'docs')}`,
        app,
        document,
        { swaggerOptions: { persistAuthorization: true } },
      );
    }

    if (openapiExport) {
      const specDir = configService.get<string>('app.openapiSpecDir', '.');
      const specPath = `${specDir}/openapi.json`;
      mkdirSync(specDir, { recursive: true });
      writeFileSync(specPath, JSON.stringify(document, null, 2));
      logger.log(`openapi.json exported to ${specPath}`);
    }
  }

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`HTTP adapter: ${configService.get<string>('app.adapter')}`);
  logger.log(`Listening on http://localhost:${port}/${globalPrefix}`);
}

void bootstrap();
