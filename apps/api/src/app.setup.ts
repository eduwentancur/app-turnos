import { StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import type { Env } from './config/env.validation.js';

/** Configuración HTTP compartida entre main.ts y los tests e2e. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // El panel llega a través del proxy de Next.js (localhost): confiar en X-Forwarded-For
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });
  // Validación con schemas Zod declarados en cada endpoint: @Body({ schema })
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
}
