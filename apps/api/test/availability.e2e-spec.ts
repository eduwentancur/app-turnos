import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AvailabilityService } from '../src/modules/availability/availability.service.js';
import { addDaysToDate, localToUtc, utcToLocal } from '../src/common/time.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

const TZ = 'America/Argentina/Buenos_Aires';

describe('Availability (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let owner: string;
  let serviceId: string;
  const today = utcToLocal(new Date(), TZ).date;
  const date = addDaysToDate(today, 7);

  const get = (url: string) =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${owner}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await createTenant(app);
    owner = await tenant.tokenFor('OWNER');

    const svc = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Corte', durationMinutes: 30, price: 8000 })
      .expect(201);
    serviceId = svc.body.id;

    // Todos los días: 09:00-12:00 y 16:00-17:00
    await request(app.getHttpServer())
      .put('/api/schedule/working-hours')
      .set('Authorization', `Bearer ${owner}`)
      .send({
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          ranges: [
            { startTime: '09:00', endTime: '12:00' },
            { startTime: '16:00', endTime: '17:00' },
          ],
        })),
      })
      .expect(200);
  });

  afterAll(async () => {
    await tenant.cleanup();
    await app.close();
  });

  const times = (body: { periods: { slots: { localTime: string }[] }[] }) =>
    body.periods.flatMap((p) => p.slots.map((s) => s.localTime));

  it('devuelve los horarios del día agrupados por franja', async () => {
    const res = await get(`/api/availability?serviceId=${serviceId}&date=${date}`).expect(200);
    expect(res.body.periods.map((p: { label: string }) => p.label)).toEqual(['Mañana', 'Tarde']);
    expect(times(res.body)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '16:00', '16:30']);
    expect(res.body.totalSlots).toBe(8);
    expect(res.body.service).toMatchObject({ name: 'Corte', durationMinutes: 30, price: 8000 });
  });

  it('descuenta turnos tomados y bloqueos', async () => {
    const customer = await prisma.customer.create({
      data: { barbershopId: tenant.barbershopId, name: 'Juan', phone: '+5493764000003' },
    });
    await prisma.appointment.create({
      data: {
        barbershopId: tenant.barbershopId,
        customerId: customer.id,
        barberId: tenant.barberId,
        serviceId,
        startsAt: localToUtc(date, '10:00', TZ),
        endsAt: localToUtc(date, '10:30', TZ),
        priceAtBooking: 8000,
      },
    });
    // Un turno cancelado no ocupa lugar
    await prisma.appointment.create({
      data: {
        barbershopId: tenant.barbershopId,
        customerId: customer.id,
        barberId: tenant.barberId,
        serviceId,
        startsAt: localToUtc(date, '09:00', TZ),
        endsAt: localToUtc(date, '09:30', TZ),
        priceAtBooking: 8000,
        status: 'CANCELLED',
      },
    });
    await request(app.getHttpServer())
      .post('/api/schedule/time-offs')
      .set('Authorization', `Bearer ${owner}`)
      .send({ startDate: date, endDate: date, startTime: '16:00', endTime: '17:00' })
      .expect(201);

    const res = await get(`/api/availability?serviceId=${serviceId}&date=${date}`).expect(200);
    expect(times(res.body)).toEqual(['09:00', '09:30', '10:30', '11:00', '11:30']);
    expect(res.body.periods.map((p: { label: string }) => p.label)).toEqual(['Mañana']);
  });

  it('resume los próximos días con la cantidad de horarios libres', async () => {
    const res = await get(`/api/availability/days?serviceId=${serviceId}&from=${addDaysToDate(date, -1)}&days=3`).expect(200);
    expect(res.body.days.map((d: { date: string; availableSlots: number }) => [d.date, d.availableSlots])).toEqual([
      [addDaysToDate(date, -1), 8],
      [date, 5],
      [addDaysToDate(date, 1), 8],
    ]);
  });

  it('un bloqueo de día completo deja el día sin horarios', async () => {
    const holiday = addDaysToDate(date, 2);
    await request(app.getHttpServer())
      .post('/api/schedule/time-offs')
      .set('Authorization', `Bearer ${owner}`)
      .send({ startDate: holiday, endDate: holiday, reason: 'Feriado' })
      .expect(201);
    const res = await get(`/api/availability?serviceId=${serviceId}&date=${holiday}`).expect(200);
    expect(res.body.totalSlots).toBe(0);
    expect(res.body.periods).toEqual([]);
  });

  it('findFreeBarbers confirma o rechaza un horario puntual', async () => {
    const availability = app.get(AvailabilityService);
    const free = await availability.findFreeBarbers(tenant.barbershopId, {
      serviceId,
      startsAt: localToUtc(date, '11:00', TZ),
    });
    expect(free).toEqual([tenant.barberId]);

    const taken = await availability.findFreeBarbers(tenant.barbershopId, {
      serviceId,
      startsAt: localToUtc(date, '10:00', TZ),
    });
    expect(taken).toEqual([]);

    // Horario fuera de la grilla (10:10) no es válido
    const offGrid = await availability.findFreeBarbers(tenant.barbershopId, {
      serviceId,
      startsAt: localToUtc(date, '10:10', TZ),
    });
    expect(offGrid).toEqual([]);
  });

  it('valida fechas pasadas, demasiado lejanas y servicios inactivos', async () => {
    await get(`/api/availability?serviceId=${serviceId}&date=${addDaysToDate(today, -1)}`).expect(400);
    await get(`/api/availability?serviceId=${serviceId}&date=${addDaysToDate(today, 90)}`).expect(400);
    await prisma.service.update({ where: { id: serviceId }, data: { isActive: false } });
    await get(`/api/availability?serviceId=${serviceId}&date=${date}`).expect(404);
    await prisma.service.update({ where: { id: serviceId }, data: { isActive: true } });
  });
});
