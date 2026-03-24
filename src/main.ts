import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Base64 images (KYC DNI photos) can be ~3-5MB
  app.use(json({ limit: '10mb' }));

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const isDev = process.env.NODE_ENV !== 'production';

  app.enableCors({
    origin: isDev
      ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
          // En desarrollo acepta localhost y IPs de red local
          if (!origin || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
            cb(null, true);
          } else {
            cb(new Error(`CORS bloqueado para: ${origin}`));
          }
        }
      : (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
          const frontendUrl = process.env.FRONTEND_URL ?? '';
          // Accept exact FRONTEND_URL and any Vercel preview deployment for the same project
          const allowed =
            !origin ||
            origin === frontendUrl ||
            /^https:\/\/saferent(-[a-z0-9]+)?-anderzubi00s-projects\.vercel\.app$/.test(origin);
          if (allowed) {
            cb(null, true);
          } else {
            cb(new Error(`CORS bloqueado para: ${origin}`));
          }
        },
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 SafeRent API corriendo en: http://localhost:${port}/api/v1`);
}

bootstrap();
