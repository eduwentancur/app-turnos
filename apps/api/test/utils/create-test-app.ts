import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

interface TestAppOptions {
  /** Desactiva el rate limiting (por defecto true) para que los tests no choquen con el límite. */
  disableThrottling?: boolean;
}

export async function createTestApp({
  disableThrottling = true,
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (disableThrottling) {
    builder = builder.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}
