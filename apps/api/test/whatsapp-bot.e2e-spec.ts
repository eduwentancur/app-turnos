import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { addDaysToDate, utcToLocal } from '../src/common/time.js';
import type { OutgoingMessage } from '../src/modules/whatsapp/bot/messages.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

const TZ = 'America/Argentina/Buenos_Aires';
const PHONE = '5493764555000'; // como lo entrega WhatsApp (sin +)

type Reply = OutgoingMessage;
const bodyOf = (r: Reply) => (r.type === 'text' ? r.text : r.body);
const rowsOf = (r: Reply) => (r.type === 'list' ? r.sections.flatMap((s) => s.rows) : []);
const last = (replies: Reply[]) => replies[replies.length - 1];

describe('WhatsApp bot (e2e, vía simulador)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let owner: string;
  const target = addDaysToDate(utcToLocal(new Date(), TZ).date, 3);
  const [ty, tm, td] = target.split('-');
  const targetLong = `${td}/${tm}/${ty}`;

  const send = async (message: object, extra: object = {}) => {
    const res = await request(app.getHttpServer())
      .post('/api/whatsapp/simulator/messages')
      .set('Authorization', `Bearer ${owner}`)
      .send({ phone: PHONE, profileName: 'Juan Pérez', message, ...extra })
      .expect(200);
    return res.body as { duplicate: boolean; replies: Reply[] };
  };
  const say = (text: string) => send({ type: 'text', text });
  const tap = (id: string) => send({ type: 'reply', id });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await createTenant(app);
    owner = await tenant.tokenFor('OWNER');
    await prisma.barbershop.update({ where: { id: tenant.barbershopId }, data: { address: 'Carlos Paz 5798, Posadas' } });
    await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Corte de cabello', durationMinutes: 30, price: 8000 })
      .expect(201);
    await request(app.getHttpServer())
      .put('/api/schedule/working-hours')
      .set('Authorization', `Bearer ${owner}`)
      .send({
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          ranges: [
            { startTime: '09:00', endTime: '12:00' },
            { startTime: '16:00', endTime: '20:00' },
          ],
        })),
      })
      .expect(200);
  });

  afterAll(async () => {
    await tenant.cleanup();
    await app.close();
  });

  it('saluda con el menú de 6 opciones', async () => {
    const { replies } = await say('Hola!');
    const menu = last(replies);
    expect(menu.type).toBe('list');
    expect(bodyOf(menu)).toContain('Juan');
    expect(rowsOf(menu).map((r) => r.id)).toEqual([
      'MENU:BOOK', 'MENU:MINE', 'MENU:RESCHEDULE', 'MENU:CANCEL', 'MENU:SERVICES', 'MENU:INFO',
    ]);
  });

  it('descarta mensajes duplicados', async () => {
    const first = await send({ type: 'text', text: 'hola' }, { messageId: 'wamid.DUP1' });
    expect(first.duplicate).toBe(false);
    const again = await send({ type: 'text', text: 'hola' }, { messageId: 'wamid.DUP1' });
    expect(again).toEqual({ duplicate: true, replies: [] });
  });

  let slotIds: string[] = [];

  it('reserva completa: nombre → servicio → día → horario (paginado) → confirmar', async () => {
    let r = await tap('MENU:BOOK');
    expect(last(r.replies)).toMatchObject({ type: 'buttons', buttons: [{ id: 'NAME:PROFILE', title: 'Usar "Juan"' }] });

    r = await tap('NAME:PROFILE');
    const services = rowsOf(last(r.replies));
    expect(services[0]).toMatchObject({ title: 'Corte de cabello', description: '$ 8.000 · 30 min' });

    r = await tap(services[0].id);
    const days = rowsOf(last(r.replies));
    expect(days.length).toBeLessThanOrEqual(10);
    const day = days.find((d) => d.id === `DAY:${target}`)!;
    expect(day.description).toBe('14 horarios libres');

    // Escribir algo que no se entiende repite el paso
    r = await say('jaja dale');
    expect(bodyOf(r.replies[0])).toContain('No te entendí');
    expect(last(r.replies).type).toBe('list');

    r = await tap(day.id);
    const page1 = last(r.replies);
    expect(page1.type === 'list' && page1.sections.map((s) => s.title)).toEqual(['Mañana', 'Tarde']);
    const rows1 = rowsOf(page1);
    expect(rows1).toHaveLength(10);
    expect(rows1.at(-1)).toMatchObject({ id: 'MORE:1', title: 'Ver más horarios ›' });

    r = await tap('MORE:1');
    const rows2 = rowsOf(last(r.replies));
    expect(rows2.map((x) => x.title)).toEqual(['17:30', '18:00', '18:30', '19:00', '19:30']);
    slotIds = rows2.map((x) => x.id);

    r = await tap(slotIds[0]);
    const confirm = last(r.replies);
    expect(confirm.type).toBe('buttons');
    expect(bodyOf(confirm)).toContain(`Fecha: ${targetLong}`);
    expect(bodyOf(confirm)).toContain('Hora: 17:30');
    expect(bodyOf(confirm)).toContain('Barbero: Barbero E2E');

    r = await tap('CONFIRM');
    expect(bodyOf(last(r.replies))).toBe(
      `¡Hola, Juan! Tu turno quedó confirmado.\n\nServicio: Corte de cabello.\nFecha: ${targetLong}.\nHora: 17:30.\nBarbero: Barbero E2E.\n\n¡Te esperamos!`,
    );

    const saved = await prisma.appointment.findFirst({
      where: { barbershopId: tenant.barbershopId },
      include: { customer: true },
    });
    expect(saved).toMatchObject({ source: 'WHATSAPP', status: 'CONFIRMED', customer: { name: 'Juan Pérez', phone: '+5493764555000' } });
  });

  it('una opción de un mensaje viejo no rompe el flujo', async () => {
    const r = await tap(slotIds[1]);
    expect(bodyOf(r.replies[0])).toContain('mensaje anterior');
    expect(rowsOf(last(r.replies))[0].id).toBe('MENU:BOOK');
  });

  it('cliente conocido: no se le vuelve a pedir el nombre; "Mis turnos" lista su turno', async () => {
    let r = await tap('MENU:BOOK');
    expect(last(r.replies).type).toBe('list');
    expect(bodyOf(last(r.replies))).toContain('¿Qué servicio querés reservar?');

    r = await tap('MENU:MINE');
    expect(bodyOf(last(r.replies))).toContain('17:30 — Corte de cabello con Barbero E2E');
  });

  it('si el horario se ocupa antes de confirmar, ofrece los disponibles', async () => {
    let r = await tap('MENU:BOOK');
    r = await tap(rowsOf(last(r.replies))[0].id);
    r = await tap(`DAY:${target}`);
    const first = rowsOf(last(r.replies))[0]; // 09:00
    r = await tap(first.id);
    expect(last(r.replies).type).toBe('buttons');

    // Otro cliente toma ese horario desde el panel justo antes
    const service = await prisma.service.findFirstOrThrow({ where: { barbershopId: tenant.barbershopId } });
    await request(app.getHttpServer())
      .post('/api/appointments')
      .set('Authorization', `Bearer ${owner}`)
      .send({ serviceId: service.id, startsAt: first.id.slice('SLOT:'.length), customer: { name: 'Otro', phone: '3764 999888' } })
      .expect(201);

    r = await tap('CONFIRM');
    expect(bodyOf(r.replies[0])).toContain('se acaba de ocupar');
    expect(rowsOf(last(r.replies)).map((x) => x.title)).not.toContain('09:00');
  });

  it('cambiar un turno', async () => {
    let r = await tap('MENU:RESCHEDULE');
    // Tiene un solo turno: va directo a elegir el día
    expect(bodyOf(last(r.replies))).toContain('¿Para qué día querés cambiar el turno?');
    r = await tap(`DAY:${target}`);
    const slot = rowsOf(last(r.replies)).find((x) => x.title === '10:00')!;
    r = await tap(slot.id);
    expect(bodyOf(last(r.replies))).toContain('Ahora:');
    r = await tap('CONFIRM');
    expect(bodyOf(last(r.replies))).toContain('quedó para el');
    expect(bodyOf(last(r.replies))).toContain('10:00');
  });

  it('cancelar un turno libera el horario', async () => {
    let r = await tap('MENU:CANCEL');
    expect(last(r.replies)).toMatchObject({ type: 'buttons', buttons: [{ id: 'CANCEL_YES' }, { id: 'CANCEL_NO' }] });
    r = await tap('CANCEL_YES');
    expect(bodyOf(last(r.replies))).toContain('quedó cancelado');
    const juan = await prisma.customer.findFirstOrThrow({ where: { barbershopId: tenant.barbershopId, phone: '+5493764555000' } });
    const active = await prisma.appointment.count({ where: { customerId: juan.id, status: 'CONFIRMED' } });
    expect(active).toBe(0);

    r = await tap('MENU:MINE');
    expect(bodyOf(last(r.replies))).toBe('No tenés turnos reservados.');
  });

  it('servicios y ubicación con los números del menú', async () => {
    let r = await say('5');
    expect(bodyOf(last(r.replies))).toContain('• Corte de cabello — $ 8.000 (30 min)');
    r = await say('6');
    const info = bodyOf(r.replies[0]);
    expect(info).toContain('Carlos Paz 5798, Posadas');
    expect(info).toContain('https://maps.google.com/?q=');
    expect(info).toContain('Lun a Dom: 09:00 a 12:00 y 16:00 a 20:00');
  });

  describe('texto libre y audios', () => {
    const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const [y, m, d] = target.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const OTHER = '5493764555111';
    const as = (message: object) =>
      request(app.getHttpServer())
        .post('/api/whatsapp/simulator/messages')
        .set('Authorization', `Bearer ${owner}`)
        .send({ phone: OTHER, profileName: 'Ana López', message })
        .expect(200)
        .then((res) => res.body as { replies: Reply[] });

    it('un pedido completo por audio va directo al resumen (después del nombre)', async () => {
      let r = await as({ type: 'text', text: `Hola, quiero un corte de cabello para el ${weekday} tipo 6 de la tarde`, fromAudio: true });
      expect(bodyOf(r.replies[0])).toContain('🎧 Entendí:');
      expect(last(r.replies)).toMatchObject({ type: 'buttons', buttons: [{ id: 'NAME:PROFILE' }] });

      r = await as({ type: 'text', text: 'Ana López' });
      const confirm = last(r.replies);
      expect(confirm.type).toBe('buttons');
      expect(bodyOf(confirm)).toContain('Servicio: Corte de cabello');
      expect(bodyOf(confirm)).toContain(`Fecha: ${targetLong}`);
      expect(bodyOf(confirm)).toContain('Hora: 18:00');

      r = await as({ type: 'reply', id: 'CONFIRM' });
      expect(bodyOf(last(r.replies))).toContain('Tu turno quedó confirmado');
    });

    it('si la hora pedida está ocupada ofrece las más cercanas', async () => {
      const r = await as({ type: 'text', text: `corte de cabello el ${weekday} a las 18` });
      expect(bodyOf(r.replies[0])).toContain('A las 18:00 no hay lugar');
      const times = rowsOf(last(r.replies)).map((x) => x.title);
      // Muestra la página donde está el horario libre más cercano
      expect(times).toContain('17:30');
      expect(times).not.toContain('18:00');
    });

    it('en medio del flujo entiende "mejor a la mañana"', async () => {
      const r = await as({ type: 'text', text: 'mejor a la mañana' });
      const list = last(r.replies);
      expect(list.type === 'list' && list.sections[0].title).toBe('Mañana');
    });

    it('intenciones por texto: precios y cancelar', async () => {
      let r = await as({ type: 'text', text: '¿cuánto sale?' });
      expect(bodyOf(last(r.replies))).toContain('Servicios y precios');
      r = await as({ type: 'text', text: 'quiero cancelar mi turno' });
      expect(last(r.replies)).toMatchObject({ type: 'buttons', buttons: [{ id: 'CANCEL_YES' }, { id: 'CANCEL_NO' }] });
    });
  });

  it('la conversación expira a los 30 minutos', async () => {
    await tap('MENU:BOOK');
    await prisma.whatsappConversation.updateMany({
      where: { barbershopId: tenant.barbershopId },
      data: { lastMessageAt: new Date(Date.now() - 31 * 60_000) },
    });
    const r = await tap('SVC:00000000-0000-0000-0000-000000000000');
    expect(bodyOf(r.replies[0])).toContain('expiró');
    expect(rowsOf(last(r.replies))[0].id).toBe('MENU:BOOK');
  });
});
