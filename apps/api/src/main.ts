import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsOrigins } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const logger = new Logger('Bootstrap');
  const origins = corsOrigins(
    process.env.CORS_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173,saldio://app',
  );
  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Tenant-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { limit: '2mb', extended: true });
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Saldio POS API')
    .setDescription(
      'API multiempresa de Saldio POS. El tenant se resuelve desde la membresía y las políticas RLS, nunca desde un identificador enviado por el cliente.',
    )
    .setVersion('0.1.0-beta.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Saldio POS API en http://localhost:${port}/api/v1`);
  logger.log(`OpenAPI en http://localhost:${port}/docs`);
}

void bootstrap();
