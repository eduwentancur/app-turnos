import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { addDaysToDate, localToUtc, utcToLocal } from '../src/common/time.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

const TZ = 'America/Argentina/Buenos_Aires';

describe('Appointments (e2e)', () => {
  let app: NestExpressApplication;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let staff: string;
  let otherOwner: string;
  let serviceId: string;
  const date = addDaysToDate(utcToLocal(new Date(), TZ).date, 7);
  const at = (hhmm: string) => localToUtc(date, hhmm, TZ).toISOString();

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`).send(body),
  });

  const slotsOf = async () => {
    const res = await as(owner).get(`/api/availability?serviceId=${serviceId}&date=${date}`).expect(200);
    return (res.body.periods as { slots: { localTime: string }[] }[]).flatMap((p) => p.slots.map((s) => s.localTime));
  };

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenant(app);
    other = await createTenant(app);
    owner = await tenant.tokenFor('OWNER');
    staff = await tenant.tokenFor('STAFF');
    otherOwner = await other.tokenFor('OWNER');

    serviceId = (await as(owner).post('/api/services', { name: 'Corte', durationMinutes: 30, price: 8000 }).expect(201)).body.id;
    await request(app.getHttpServer())
      .put('/api/schedule/working-hours')
      .set('Authorization', `Bearer ${owner}`)
      .send({
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          ranges: [{ startTime: '09:00', endTime: '12:00' }],
        })),
      })
      .expect(200);
  });

  afterAll(async () => {
    await tenant.cleanup();
    await other.cleanup();
    await app.close();
  });

  let appointmentId: string;

  it('crea un turno con un cliente nuevo y normaliza el teléfono', async () => {
    const res = await as(owner)
      .post('/api/appointments', {
        serviceId,
        startsAt: at('10:00'),
        customer: { name: 'Juan Pérez', phone: '+54 9 3764 11-1222' },
      })
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'CONFIRMED',
      source: 'ADMIN',
      localDate: date,
      localStart: '10:00',
      localEnd: '10:30',
      price: 8000,
      barber: { id: tenant.barberId },
      customer: { name: 'Juan Pérez', phone: '+5493764111222' },
    });
    appointmentId = res.body.id;
    expect(await slotsOf()).not.toContain('10:00');
  });

  it('el mismo teléfono reutiliza el cliente', async () => {
    const res = await as(owner)
      .post('/api/appointments', { serviceId, startsAt: at('11:00'), customer: { name: 'Juan', phone: '5493764111222' } })
      .expect(201);
    const found = await as(owner).get('/api/customers?search=111222').expect(200);
    expect(found.body.total).toBe(1);
    expect(found.body.items[0].id).toBe(res.body.customer.id);
    await as(owner).post(`/api/appointments/${res.body.id}/cancel`).expect(201);
  });

  it('no permite reservar un horario ocupado, fuera de grilla o en el pasado', async () => {
    const customer = { name: 'Otro', phone: '+5493764999000' };
    await as(owner).post('/api/appointments', { serviceId, startsAt: at('10:00'), customer }).expect(409);
    await as(owner).post('/api/appointments', { serviceId, startsAt: at('10:10'), customer }).expect(409);
    await as(owner)
      .post('/api/appointments', { serviceId, startsAt: new Date(Date.now() - 3_600_000).toISOString(), customer })
      .expect(400);
  });

  it('dos reservas simultáneas del mismo horario: solo una gana', async () => {
    const book = (phone: string) =>
      as(owner).post('/api/appointments', { serviceId, startsAt: at('09:00'), customer: { name: 'Cliente', phone } });
    const results = await Promise.all([book('+5493764000101'), book('+5493764000102'), book('+5493764000103')]);
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409, 409]);
  });

  it('OWNER puede reservar fuera del horario; STAFF no', async () => {
    const body = { serviceId, startsAt: at('14:00'), customer: { name: 'Fuera', phone: '+5493764000200' } };
    await as(staff).post('/api/appointments', { ...body, allowOutsideSchedule: true }).expect(409);
    const res = await as(owner).post('/api/appointments', { ...body, allowOutsideSchedule: true }).expect(201);
    expect(res.body.localStart).toBe('14:00');
    // Igual se evita el choque
    await as(owner)
      .post('/api/appointments', { ...body, customer: { name: 'Otro', phone: '+5493764000201' }, allowOutsideSchedule: true })
      .expect(409);
  });

  it('reprograma a un horario libre y rechaza uno ocupado', async () => {
    await as(owner).patch(`/api/appointments/${appointmentId}/reschedule`, { startsAt: at('09:00') }).expect(409);
    const res = await as(owner).patch(`/api/appointments/${appointmentId}/reschedule`, { startsAt: at('10:30') }).expect(200);
    expect(res.body.localStart).toBe('10:30');
    // Correrlo media hora sobre su propio horario también es válido
    await as(owner).patch(`/api/appointments/${appointmentId}/reschedule`, { startsAt: at('10:00') }).expect(200);
  });

  it('cancelar libera el horario y no se puede cancelar dos veces', async () => {
    const res = await as(owner)
      .post(`/api/appointments/${appointmentId}/cancel`, { reason: 'No puede venir' })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'CANCELLED', notes: 'Cancelado: No puede venir' });
    expect(await slotsOf()).toContain('10:00');
    await as(owner).post(`/api/appointments/${appointmentId}/cancel`).expect(409);
    await as(owner).patch(`/api/appointments/${appointmentId}/reschedule`, { startsAt: at('11:30') }).expect(409);
  });

  it('no se marca asistencia de un turno futuro', async () => {
    const list = await as(owner).get(`/api/appointments?from=${date}&to=${date}`).expect(200);
    await as(owner).patch(`/api/appointments/${list.body[0].id}/status`, { status: 'COMPLETED' }).expect(400);
  });

  it('lista por rango (sin cancelados por defecto)', async () => {
    const active = await as(owner).get(`/api/appointments?from=${date}&to=${date}`).expect(200);
    expect(active.body.map((a: { localStart: string }) => a.localStart)).toEqual(['09:00', '14:00']);
    const all = await as(owner).get(`/api/appointments?from=${date}&to=${date}&includeCancelled=true`).expect(200);
    expect(all.body).toHaveLength(4);
    await as(owner).get(`/api/appointments?from=${date}&to=${addDaysToDate(date, 90)}`).expect(400);
  });

  it('aislamiento entre barberías', async () => {
    await as(otherOwner).get(`/api/appointments/${appointmentId}`).expect(404);
    await as(otherOwner).post(`/api/appointments/${appointmentId}/cancel`).expect(404);
    const list = await as(otherOwner).get(`/api/appointments?from=${date}&to=${date}`).expect(200);
    expect(list.body).toHaveLength(0);
  });
});
