import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app.js';

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ disableThrottling: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloquea el login después de 5 intentos por minuto', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nadie@test.local', password: 'x' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
