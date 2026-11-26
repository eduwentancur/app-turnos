import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

describe('Schedule (e2e)', () => {
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

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    put: (url: string, body: object) =>
      request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${token}`).send(body),
    post: (url: string, body: object) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body),
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
  });

  describe('horario semanal', () => {
    it('arranca vacío con los 7 días', async () => {
      const res = await as(owner).get('/api/schedule/working-hours').expect(200);
      expect(res.body.days).toHaveLength(7);
      expect(res.body.days.every((d: { ranges: unknown[] }) => d.ranges.length === 0)).toBe(true);
      expect(res.body.timezone).toBe('America/Argentina/Buenos_Aires');
    });

    it('guarda franjas con descanso y las devuelve ordenadas', async () => {
      const week = {
        days: [
          { dayOfWeek: 1, ranges: [{ startTime: '16:00', endTime: '20:00' }, { startTime: '09:00', endTime: '13:00' }] },
          { dayOfWeek: 6, ranges: [{ startTime: '09:00', endTime: '14:00' }] },
        ],
      };
      const res = await as(owner).put('/api/schedule/working-hours', week).expect(200);
      expect(res.body.days[1].ranges).toEqual([
        { startTime: '09:00', endTime: '13:00' },
        { startTime: '16:00', endTime: '20:00' },
      ]);
      expect(res.body.days[0].ranges).toEqual([]);
    });

    it('reemplaza la semana completa (no acumula)', async () => {
      await as(owner)
        .put('/api/schedule/working-hours', { days: [{ dayOfWeek: 2, ranges: [{ startTime: '10:00', endTime: '18:00' }] }] })
        .expect(200);
      const rows = await prisma.workingHours.count({ where: { barbershopId: tenant.barbershopId } });
      expect(rows).toBe(1);
    });

    it('rechaza franjas superpuestas, invertidas y horas inválidas', async () => {
      const bad = async (ranges: object[]) =>
        as(owner).put('/api/schedule/working-hours', { days: [{ dayOfWeek: 1, ranges }] }).expect(400);
      await bad([{ startTime: '09:00', endTime: '13:00' }, { startTime: '12:00', endTime: '15:00' }]);
      await bad([{ startTime: '13:00', endTime: '09:00' }]);
      await bad([{ startTime: '25:00', endTime: '26:00' }]);
    });

    it('cada barbería ve su propio horario; STAFF no puede modificar', async () => {
      const res = await as(otherOwner).get('/api/schedule/working-hours').expect(200);
      expect(res.body.days.every((d: { ranges: unknown[] }) => d.ranges.length === 0)).toBe(true);
      await as(staff).put('/api/schedule/working-hours', { days: [] }).expect(403);
      await as(otherOwner)
        .put('/api/schedule/working-hours', { barberId: tenant.barberId, days: [] })
        .expect(404);
    });
  });

  describe('bloqueos', () => {
    it('bloqueo de día completo se guarda en UTC respetando la zona horaria', async () => {
      const res = await as(owner)
        .post('/api/schedule/time-offs', { startDate: '2030-12-24', endDate: '2030-12-25', reason: 'Navidad' })
        .expect(201);
      expect(res.body).toMatchObject({
        startsAt: '2030-12-24T03:00:00.000Z',
        endsAt: '2030-12-26T03:00:00.000Z',
        startDate: '2030-12-24',
        endDate: '2030-12-25',
        allDay: true,
        reason: 'Navidad',
        conflictingAppointments: 0,
      });
    });

    it('bloqueo parcial avisa si hay turnos tomados en ese horario', async () => {
      const service = await prisma.service.create({
        data: { barbershopId: tenant.barbershopId, name: 'Corte', durationMinutes: 30, price: 1 },
      });
      const customer = await prisma.customer.create({
        data: { barbershopId: tenant.barbershopId, name: 'Cliente', phone: '+5493764000002' },
      });
      await prisma.appointment.create({
        data: {
          barbershopId: tenant.barbershopId,
          customerId: customer.id,
          barberId: tenant.barberId,
          serviceId: service.id,
          startsAt: new Date('2030-12-30T13:00:00Z'), // 10:00 local
          endsAt: new Date('2030-12-30T13:30:00Z'),
          priceAtBooking: 1,
        },
      });

      const res = await as(owner)
        .post('/api/schedule/time-offs', {
          startDate: '2030-12-30',
          endDate: '2030-12-30',
          startTime: '09:00',
          endTime: '12:00',
        })
        .expect(201);
      expect(res.body).toMatchObject({ allDay: false, startTime: '09:00', endTime: '12:00', conflictingAppointments: 1 });
    });

    it('valida fechas y horas incompletas', async () => {
      await as(owner)
        .post('/api/schedule/time-offs', { startDate: '2030-12-10', endDate: '2030-12-09' })
        .expect(400);
      await as(owner)
        .post('/api/schedule/time-offs', { startDate: '2030-12-10', endDate: '2030-12-10', startTime: '10:00' })
        .expect(400);
    });

    it('lista bloqueos futuros y permite borrarlos', async () => {
      const list = await as(owner).get('/api/schedule/time-offs').expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(2);
      const id = list.body[0].id as string;

      await as(otherOwner).delete(`/api/schedule/time-offs/${id}`).expect(404);
      await as(owner).delete(`/api/schedule/time-offs/${id}`).expect(204);
      await as(owner).delete(`/api/schedule/time-offs/${id}`).expect(404);
    });
  });
});
