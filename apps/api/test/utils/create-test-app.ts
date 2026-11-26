import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

interface TestAppOptions {
  /** Desactiva el rate limiting (por defecto true) para que los tests no choquen con el límite. */
  disableThrottling?: boolean;
  /** Permite reemplazar providers (ej. el cliente de la API de WhatsApp). */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp({
  disableThrottling = true,
  customize,
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (disableThrottling) {
    builder = builder.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}
