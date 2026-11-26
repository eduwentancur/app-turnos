import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

const DAY = 86_400_000;

describe('Customers (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let otherOwner: string;
  const ids: Record<string, string> = {};

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string, body: object) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`).send(body),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await createTenant(app);
    other = await createTenant(app);
    owner = await tenant.tokenFor('OWNER');
    otherOwner = await other.tokenFor('OWNER');

    const service = await prisma.service.create({
      data: { barbershopId: tenant.barbershopId, name: 'Corte', durationMinutes: 30, price: 8000 },
    });
    for (const [key, name, phone] of [
      ['ana', 'Ana', '+5493764000301'],
      ['beto', 'Beto', '+5493764000302'],
      ['caro', 'Caro', '+5493764000303'],
    ]) {
      ids[key] = (await prisma.customer.create({ data: { barbershopId: tenant.barbershopId, name, phone } })).id;
    }

    let n = 0;
    const appt = (customer: string, daysFromNow: number, status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW', price = 8000) => {
      // Horas distintas para no chocar con la constraint de superposición
      const startsAt = new Date(Date.now() + daysFromNow * DAY + n++ * 3_600_000);
      return prisma.appointment.create({
        data: {
          barbershopId: tenant.barbershopId,
          customerId: ids[customer],
          barberId: tenant.barberId,
          serviceId: service.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          priceAtBooking: price,
          status,
        },
      });
    };
    // Ana: 3 visitas (una sin marcar), 1 cancelación, próximo turno
    await appt('ana', -30, 'COMPLETED');
    await appt('ana', -10, 'COMPLETED', 9000);
    await appt('ana', -2, 'CONFIRMED');
    await appt('ana', -5, 'CANCELLED');
    await appt('ana', 3, 'CONFIRMED');
    // Beto: 1 visita hace mucho y 1 falta
    await appt('beto', -60, 'COMPLETED');
    await appt('beto', -20, 'NO_SHOW');
    // Caro: sin turnos
  });

  afterAll(async () => {
    await tenant.cleanup();
    await other.cleanup();
    await app.close();
  });

  it('lista con estadísticas', async () => {
    const res = await as(owner).get('/api/customers?sort=frequent').expect(200);
    expect(res.body.total).toBe(3);
    const [ana, beto, caro] = res.body.items;
    expect(ana).toMatchObject({ name: 'Ana', visits: 3, totalSpent: 25000, cancellations: 1, noShows: 0 });
    expect(ana.nextAppointment).not.toBeNull();
    expect(beto).toMatchObject({ name: 'Beto', visits: 1, noShows: 1, nextAppointment: null });
    expect(caro).toMatchObject({ name: 'Caro', visits: 0, lastVisit: null });
  });

  it('ordena por inactivos: primero los que no tienen próximo turno y hace más que no vienen', async () => {
    const res = await as(owner).get('/api/customers?sort=inactive').expect(200);
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual(['Beto', 'Caro', 'Ana']);
  });

  it('busca y pagina', async () => {
    const byPhone = await as(owner).get('/api/customers?search=000302').expect(200);
    expect(byPhone.body.items.map((c: { name: string }) => c.name)).toEqual(['Beto']);
    const page = await as(owner).get('/api/customers?sort=name&pageSize=2&page=2').expect(200);
    expect(page.body).toMatchObject({ total: 3, page: 2 });
    expect(page.body.items.map((c: { name: string }) => c.name)).toEqual(['Caro']);
  });

  it('ficha con historial ordenado del más nuevo al más viejo', async () => {
    const res = await as(owner).get(`/api/customers/${ids.ana}`).expect(200);
    expect(res.body.history).toHaveLength(5);
    const dates = res.body.history.map((h: { startsAt: string }) => Date.parse(h.startsAt));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(res.body.history[0]).toMatchObject({ service: 'Corte', barber: 'Barbero E2E' });
  });

  it('edita notas, nombre y teléfono (normalizado y único)', async () => {
    const res = await as(owner)
      .patch(`/api/customers/${ids.caro}`, { notes: 'Degradé bajo', name: 'Carolina', phone: '3764 000999' })
      .expect(200);
    expect(res.body).toMatchObject({ notes: 'Degradé bajo', name: 'Carolina', phone: '+5493764000999' });
    await as(owner).patch(`/api/customers/${ids.caro}`, { phone: '+5493764000301' }).expect(409);
    await as(owner).patch(`/api/customers/${ids.caro}`, { notes: '' }).expect(200);
    const after = await as(owner).get(`/api/customers/${ids.caro}`).expect(200);
    expect(after.body.notes).toBeNull();
  });

  it('aislamiento entre barberías', async () => {
    await as(otherOwner).get(`/api/customers/${ids.ana}`).expect(404);
    await as(otherOwner).patch(`/api/customers/${ids.ana}`, { notes: 'x' }).expect(404);
    const list = await as(otherOwner).get('/api/customers').expect(200);
    expect(list.body.total).toBe(0);
  });
});
