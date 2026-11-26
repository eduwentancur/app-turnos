import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app.js';

describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health es público y responde 200 con la base arriba', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('rutas inexistentes devuelven el formato de error estándar', async () => {
    const res = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: '/api/no-existe' });
  });
});
