import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // CORS_ORIGIN accepts '*' (default), a single origin, or a comma-separated list. An "origin"
  // is scheme+host+port exactly as the browser sends it (e.g. http://192.168.1.50:5173) - a bare
  // IP or hostname will never match and CORS will silently keep failing.
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  const origin =
    !corsOrigin || corsOrigin === '*'
      ? '*'
      : corsOrigin.includes(',')
        ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
        : corsOrigin;

  // Enable CORS for frontend connection
  app.enableCors({
    origin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  logger.log(`CORS origin: ${JSON.stringify(origin)}`);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Trading Automation Backend running on: http://localhost:${port}`);
}
bootstrap();
