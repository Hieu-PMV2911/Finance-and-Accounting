import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

async function bootstrap() {
  // `rawBody: true` giữ lại body thô cho route webhook nhận vào — cần body thô
  // để tính lại chữ ký HMAC (JSON.stringify lại object có thể đổi thứ tự khóa).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // All routes are served under /api
  app.setGlobalPrefix('api');

  // CORS for the Vite dev server
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    credentials: true,
  });

  // Reject unknown fields and coerce payloads to DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI / Swagger docs at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Accounting Ledger API')
    .setDescription('Double-entry accounting ledger — chart of accounts, journals, ledger, reporting.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${port}/api — docs at http://localhost:${port}/api/docs`);
}
await bootstrap();
