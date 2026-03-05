import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const isDev = process.env.NODE_ENV !== 'production';

  app.enableCors({
    origin: isDev
      ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
          // En desarrollo acepta cualquier localhost independientemente del puerto
          if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
            cb(null, true);
          } else {
            cb(new Error(`CORS bloqueado para: ${origin}`));
          }
        }
      : process.env.FRONTEND_URL,
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 SafeRent API corriendo en: http://localhost:${port}/api/v1`);
}

bootstrap();
