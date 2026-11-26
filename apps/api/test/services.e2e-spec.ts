import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

describe('Services (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let staff: string;
  let otherOwner: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await createTenant(app);
    other = await createTenant(app);
    owner = await tenant.tokenFor('OWNER');
    staff = await tenant.tokenFor('STAFF');
    otherOwner = await other.tokenFor('OWNER');
  });

  afterAll(async () => {
    await tenant.cleanup();
    await other.cleanup();
    await app.close();
  });

  const api = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
  });

  let corteId: string;

  it('crea un servicio y lo asigna al barbero', async () => {
    const res = await api(owner)
      .post('/api/services', { name: '  Corte  ', durationMinutes: 30, price: 8000 })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Corte', durationMinutes: 30, price: 8000, isActive: true });
    corteId = res.body.id;

    const link = await prisma.barberService.findUnique({
      where: { barberId_serviceId: { barberId: tenant.barberId, serviceId: corteId } },
    });
    expect(link).not.toBeNull();
  });

  it('valida los datos (nombre > 24, duración no múltiplo de 5, precio negativo)', async () => {
    const res = await api(owner)
      .post('/api/services', { name: 'Un nombre larguísimo de servicio', durationMinutes: 33, price: -1 })
      .expect(400);
    expect(res.body.message).toHaveLength(3);
  });

  it('rechaza nombres duplicados en la misma barbería (sin distinguir mayúsculas)', async () => {
    const res = await api(owner)
      .post('/api/services', { name: 'CORTE', durationMinutes: 30, price: 1 })
      .expect(409);
    expect(res.body.message).toContain('Corte');
  });

  it('otra barbería puede usar el mismo nombre y no ve los servicios ajenos', async () => {
    await api(otherOwner).post('/api/services', { name: 'Corte', durationMinutes: 20, price: 5000 }).expect(201);
    const list = await api(otherOwner).get('/api/services').expect(200);
    expect(list.body).toHaveLength(1);
    await api(otherOwner).get(`/api/services/${corteId}`).expect(404);
    await api(otherOwner).patch(`/api/services/${corteId}`, { price: 1 }).expect(404);
  });

  it('STAFF puede ver pero no modificar', async () => {
    await api(staff).get('/api/services').expect(200);
    await api(staff).post('/api/services', { name: 'Barba', durationMinutes: 20, price: 5000 }).expect(403);
  });

  it('desactivar oculta el servicio del listado por defecto', async () => {
    await api(owner).patch(`/api/services/${corteId}`, { isActive: false, price: 8500.5 }).expect(200);
    const active = await api(owner).get('/api/services').expect(200);
    expect(active.body).toHaveLength(0);
    const all = await api(owner).get('/api/services?includeInactive=true').expect(200);
    expect(all.body[0]).toMatchObject({ isActive: false, price: 8500.5 });
  });

  it('no permite eliminar un servicio con turnos; sí uno sin uso', async () => {
    const customer = await prisma.customer.create({
      data: { barbershopId: tenant.barbershopId, name: 'Cliente', phone: '+5493764000001' },
    });
    await prisma.appointment.create({
      data: {
        barbershopId: tenant.barbershopId,
        customerId: customer.id,
        barberId: tenant.barberId,
        serviceId: corteId,
        startsAt: new Date('2030-01-01T13:00:00Z'),
        endsAt: new Date('2030-01-01T13:30:00Z'),
        priceAtBooking: 8000,
      },
    });
    await api(owner).delete(`/api/services/${corteId}`).expect(409);

    const barba = await api(owner).post('/api/services', { name: 'Barba', durationMinutes: 20, price: 5000 }).expect(201);
    await api(owner).delete(`/api/services/${barba.body.id}`).expect(204);
    await api(owner).get(`/api/services/${barba.body.id}`).expect(404);
  });

  it('valida el id', async () => {
    await api(owner).get('/api/services/no-es-uuid').expect(400);
  });
});
