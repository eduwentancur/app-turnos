import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AvailabilityService } from '../../availability/availability.service.js';
import { AppointmentsService } from '../../appointments/appointments.service.js';
import { ServicesService } from '../../services/services.service.js';
import { buttons, list, text, LIMITS, type ListRow, type OutgoingMessage } from './messages.js';
import { duration, firstName, longDate, price, shortDate } from './bot.presenter.js';
import { IDS, prefixed, type BotContext, type FlowResult, type Turn } from './bot.types.js';
import type { Interpretation } from './interpreter.js';

const DAYS_TO_SEARCH = 21;
const MAX_NAME = 60;

/**
 * Flujo de reserva y de reprogramación:
 * nombre (si es cliente nuevo) → servicio → barbero (si hay más de uno) → día → horario → confirmar.
 * Reprogramar reutiliza día → horario → confirmar con ctx.mode = 'reschedule'.
 */
@Injectable()
export class BookingFlow {
  constructor(
    private readonly prisma: PrismaService,
    private readonly services: ServicesService,
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
  ) {}

  /** Punto de entrada de "Reservar turno" (con lo que haya entendido de un texto o audio). */
  async start(turn: Turn, wish: Interpretation = {}): Promise<FlowResult> {
    const ctx: BotContext = {
      mode: 'book',
      ...(wish.serviceId ? { serviceId: wish.serviceId } : {}),
      ...(wish.date || wish.time || wish.period ? { pref: { date: wish.date, time: wish.time, period: wish.period } } : {}),
    };
    if (turn.customer) return this.advance(turn, { ...ctx, customerName: turn.customer.name });

    const body = '¡Genial! Para reservar, ¿a nombre de quién hago el turno?\nEscribí tu nombre y apellido.';
    const replies: OutgoingMessage[] = turn.profileName
      ? [buttons(body, [{ id: IDS.useProfileName, title: `Usar "${firstName(turn.profileName)}"` }])]
      : [text(body)];
    return { state: 'ASK_NAME', ctx, replies };
  }

  async onName(turn: Turn, input: { text?: string; useProfile?: boolean }): Promise<FlowResult> {
    const raw = input.useProfile ? turn.profileName : input.text;
    const name = raw?.trim().replace(/\s+/g, ' ');
    if (!name || name.length < 2 || name.length > MAX_NAME || !/\p{L}/u.test(name)) {
      return { state: 'ASK_NAME', ctx: turn.ctx, replies: [text('No entendí el nombre 🤔 Escribilo de nuevo, por ejemplo: Juan Pérez')] };
    }
    return this.advance(turn, { ...turn.ctx, customerName: name });
  }

  /**
   * Avanza al primer dato que falta: servicio → barbero → día → horario → confirmar.
   * Usa lo que el cliente ya dijo (ctx.serviceId, ctx.pref) para saltear pasos.
   */
  async advance(turn: Turn, ctx: BotContext): Promise<FlowResult> {
    if (!ctx.serviceId) return this.askService(turn, ctx);
    if (ctx.barberId === undefined) return this.onService(turn, ctx.serviceId, ctx);
    return this.afterBarber(turn, ctx);
  }

  /** Con servicio y barbero definidos: aplica el día / hora pedidos o pregunta. */
  private async afterBarber(turn: Turn, ctx: BotContext): Promise<FlowResult> {
    const { pref, ...rest } = ctx;
    if (!pref?.date) return this.askDay(turn, rest);

    const withDate: BotContext = { ...rest, date: pref.date, page: 0 };
    const day = await this.dayAvailability(turn.barbershopId, withDate);
    if (!day || day.totalSlots === 0) {
      return this.withNotice(`El ${shortDate(pref.date)} no hay horarios disponibles 😕 Elegí otro día:`, await this.askDay(turn, rest));
    }
    if (pref.time) {
      const slot = day.periods.flatMap((p) => p.slots).find((s) => s.localTime === pref.time);
      if (slot) return this.onSlot(turn, slot.start, withDate);
      return this.withNotice(
        `A las ${pref.time} no hay lugar el ${shortDate(pref.date)}. Estos son los horarios libres más cercanos:`,
        await this.askSlot(turn, withDate, { time: pref.time }),
      );
    }
    if (pref.period) {
      const has = day.periods.some((p) => p.key === pref.period);
      const label = { MORNING: 'a la mañana', AFTERNOON: 'a la tarde', EVENING: 'a la noche' }[pref.period];
      const result = await this.askSlot(turn, withDate, { period: pref.period });
      return has ? result : this.withNotice(`El ${shortDate(pref.date)} no quedan horarios ${label}. Te muestro los del día:`, result);
    }
    return this.askSlot(turn, withDate);
  }

  async askService(turn: Turn, ctx: BotContext): Promise<FlowResult> {
    const active = await this.services.list(turn.barbershopId, { includeInactive: false });
    if (active.length === 0) {
      return { state: 'IDLE', ctx: {}, replies: [this.backToMenu('Por ahora no hay servicios disponibles para reservar 😕')] };
    }
    const rows: ListRow[] = active.slice(0, LIMITS.rowsPerList).map((s) => ({
      id: prefixed('SVC', s.id),
      title: s.name,
      description: `${price(s.price)} · ${duration(s.durationMinutes)}`,
    }));
    const greeting = ctx.customerName ? `Perfecto, ${firstName(ctx.customerName)}. ` : '';
    return {
      state: 'PICK_SERVICE',
      ctx,
      replies: [list(`${greeting}¿Qué servicio querés reservar?`, 'Ver servicios', [{ rows }])],
    };
  }

  async onService(turn: Turn, serviceId: string, base: BotContext = turn.ctx): Promise<FlowResult> {
    const active = await this.services.list(turn.barbershopId, { includeInactive: false });
    if (!active.some((s) => s.id === serviceId)) {
      return this.withNotice('Ese servicio ya no está disponible.', await this.askService(turn, { ...base, serviceId: undefined }));
    }
    const ctx: BotContext = { ...base, serviceId, barberId: null };
    const barbers = await this.barbersFor(turn.barbershopId, serviceId);
    if (barbers.length <= 1) return this.afterBarber(turn, ctx);

    const rows: ListRow[] = [
      { id: IDS.anyBarber, title: 'Cualquiera', description: 'El primero disponible' },
      ...barbers.slice(0, LIMITS.rowsPerList - 1).map((b) => ({ id: prefixed('BRB', b.id), title: b.name })),
    ];
    return {
      state: 'PICK_BARBER',
      ctx: { ...ctx, barberId: undefined },
      replies: [list('¿Con quién te querés atender?', 'Ver barberos', [{ rows }])],
    };
  }

  async onBarber(turn: Turn, barberId: string | null): Promise<FlowResult> {
    if (barberId) {
      const ok = (await this.barbersFor(turn.barbershopId, turn.ctx.serviceId!)).some((b) => b.id === barberId);
      if (!ok) return this.withNotice('Ese barbero no está disponible.', await this.onService(turn, turn.ctx.serviceId!));
    }
    return this.afterBarber(turn, { ...turn.ctx, barberId });
  }

  async askDay(turn: Turn, ctx: BotContext): Promise<FlowResult> {
    const summary = await this.availability.getDays(turn.barbershopId, {
      serviceId: ctx.serviceId!,
      days: DAYS_TO_SEARCH,
      barberId: ctx.barberId ?? undefined,
    });
    const days = summary.days.filter((d) => d.availableSlots > 0).slice(0, LIMITS.rowsPerList);
    if (days.length === 0) {
      return {
        state: 'IDLE',
        ctx: {},
        replies: [this.backToMenu(`No hay horarios disponibles para ${summary.service.name} en los próximos días 😕`)],
      };
    }
    const rows = days.map((d) => ({
      id: prefixed('DAY', d.date),
      title: shortDate(d.date),
      description: `${d.availableSlots} horario${d.availableSlots === 1 ? '' : 's'} libre${d.availableSlots === 1 ? '' : 's'}`,
    }));
    const intro =
      ctx.mode === 'reschedule'
        ? '¿Para qué día querés cambiar el turno?'
        : `${summary.service.name} (${duration(summary.service.durationMinutes)}, ${price(summary.service.price)}).\n¿Qué día te queda bien?`;
    return { state: 'PICK_DAY', ctx: { ...ctx, date: undefined, page: 0 }, replies: [list(intro, 'Ver días', [{ rows }])] };
  }

  async onDay(turn: Turn, date: string): Promise<FlowResult> {
    return this.askSlot(turn, { ...turn.ctx, date, page: 0 });
  }

  async askSlot(
    turn: Turn,
    ctx: BotContext,
    focus?: { time?: string; period?: 'MORNING' | 'AFTERNOON' | 'EVENING' },
  ): Promise<FlowResult> {
    const day = await this.dayAvailability(turn.barbershopId, ctx);
    if (!day || day.totalSlots === 0) {
      return this.withNotice('Ese día ya no quedan horarios. Elegí otro 🙏', await this.askDay(turn, ctx));
    }

    // Paginado como exige WhatsApp: 10 filas como máximo; si hay más, 9 + "Ver más horarios"
    const flat = day.periods.flatMap((p) => p.slots.map((s) => ({ period: p.label, slot: s })));
    const perPage = flat.length <= LIMITS.rowsPerList ? LIMITS.rowsPerList : LIMITS.rowsPerList - 1;
    const pages = Math.ceil(flat.length / perPage);
    let page = Math.min(ctx.page ?? 0, pages - 1);
    if (focus) {
      // Página donde está el horario más cercano al pedido (o el primero de la franja)
      const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
      let index = 0;
      if (focus.time) {
        const target = toMin(focus.time);
        index = flat.reduce((best, x, i) => (Math.abs(toMin(x.slot.localTime) - target) < Math.abs(toMin(flat[best].slot.localTime) - target) ? i : best), 0);
      } else if (focus.period) {
        const key = day.periods.find((p) => p.key === focus.period)?.label;
        index = Math.max(0, flat.findIndex((x) => x.period === key));
      }
      page = Math.floor(index / perPage);
    }
    const items = flat.slice(page * perPage, page * perPage + perPage);

    const sections: { title: string; rows: ListRow[] }[] = [];
    for (const { period, slot } of items) {
      if (sections.at(-1)?.title !== period) sections.push({ title: period, rows: [] });
      sections.at(-1)!.rows.push({ id: prefixed('SLOT', slot.start), title: slot.localTime });
    }
    if (page < pages - 1) {
      sections.at(-1)!.rows.push({ id: prefixed('MORE', page + 1), title: 'Ver más horarios ›' });
    }

    const body = `Elegí el horario para el ${shortDate(day.date)} 💈`;
    return {
      state: 'PICK_SLOT',
      ctx: { ...ctx, page },
      replies: [list(body, 'Ver horarios', sections, pages > 1 ? `Página ${page + 1} de ${pages}` : undefined)],
    };
  }

  async onMore(turn: Turn, page: number): Promise<FlowResult> {
    return this.askSlot(turn, { ...turn.ctx, page });
  }

  async onSlot(turn: Turn, slotStart: string, base: BotContext = turn.ctx): Promise<FlowResult> {
    const day = await this.dayAvailability(turn.barbershopId, base);
    const slot = day?.periods.flatMap((p) => p.slots).find((s) => s.start === slotStart);
    if (!slot) {
      return this.withNotice('Ese horario ya no está disponible 😕', await this.askSlot(turn, base));
    }
    return this.askConfirm(turn, {
      ...base,
      slotStart,
      slotTime: slot.localTime,
      slotBarberId: base.barberId ?? slot.barberIds[0],
    });
  }

  async askConfirm(turn: Turn, ctx: BotContext): Promise<FlowResult> {
    const [service, barber] = await Promise.all([
      this.prisma.service.findUnique({ where: { id: ctx.serviceId! }, select: { name: true, price: true } }),
      ctx.slotBarberId
        ? this.prisma.barber.findUnique({ where: { id: ctx.slotBarberId }, select: { name: true } })
        : null,
    ]);
    const time = ctx.slotTime;

    if (ctx.mode === 'reschedule') {
      const current = await this.appointments.findOne(turn.barbershopId, ctx.appointmentId!);
      const body =
        `Vas a cambiar tu turno de ${service?.name}:\n\n` +
        `Antes: ${shortDate(current.localDate)} ${current.localStart}\n` +
        `Ahora: ${shortDate(ctx.date!)} ${time}`;
      return {
        state: 'CONFIRM',
        ctx,
        replies: [
          buttons(body, [
            { id: IDS.confirm, title: '✅ Confirmar cambio' },
            { id: IDS.changeSlot, title: '🔄 Otro horario' },
            { id: IDS.abort, title: '✖ Dejarlo como está' },
          ]),
        ],
      };
    }

    const body =
      `Revisá tu turno:\n\n` +
      `Servicio: ${service?.name}\n` +
      `Fecha: ${longDate(ctx.date!)}\n` +
      `Hora: ${time}\n` +
      (barber ? `Barbero: ${barber.name}\n` : '') +
      `Precio: ${price(Number(service?.price ?? 0))}`;
    return {
      state: 'CONFIRM',
      ctx,
      replies: [
        buttons(body, [
          { id: IDS.confirm, title: '✅ Confirmar' },
          { id: IDS.changeSlot, title: '🔄 Cambiar horario' },
          { id: IDS.abort, title: '✖ Cancelar' },
        ]),
      ],
    };
  }

  /** Guarda el turno. Si otro cliente ganó el horario, vuelve a mostrar los disponibles. */
  async onConfirm(turn: Turn): Promise<FlowResult> {
    const ctx = turn.ctx;
    try {
      if (ctx.mode === 'reschedule') {
        const updated = await this.appointments.reschedule(
          turn.barbershopId,
          ctx.appointmentId!,
          { startsAt: new Date(ctx.slotStart!), ...(ctx.barberId ? { barberId: ctx.barberId } : {}) },
          { canOverrideSchedule: false },
        );
        return {
          state: 'IDLE',
          ctx: {},
          replies: [
            this.backToMenu(
              `Listo ✅ Tu turno de ${updated.service.name} quedó para el ${shortDate(updated.localDate)} a las ${updated.localStart}.\n\n¡Te esperamos!`,
            ),
          ],
        };
      }

      const created = await this.appointments.create(
        turn.barbershopId,
        {
          serviceId: ctx.serviceId!,
          startsAt: new Date(ctx.slotStart!),
          ...(ctx.barberId ? { barberId: ctx.barberId } : {}),
          customer: { name: ctx.customerName ?? turn.customer?.name ?? 'Cliente', phone: turn.phone },
        },
        { canOverrideSchedule: false, source: 'WHATSAPP' },
      );
      const message =
        `¡Hola, ${firstName(created.customer.name)}! Tu turno quedó confirmado.\n\n` +
        `Servicio: ${created.service.name}.\n` +
        `Fecha: ${longDate(created.localDate)}.\n` +
        `Hora: ${created.localStart}.\n` +
        `Barbero: ${created.barber.name}.\n\n` +
        `¡Te esperamos!`;
      return { state: 'IDLE', ctx: {}, replies: [this.backToMenu(message)] };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        return this.withNotice(
          'Uy, ese horario se acaba de ocupar 😕 Elegí otro:',
          await this.askSlot(turn, { ...ctx, slotStart: undefined }),
        );
      }
      if (error instanceof NotFoundException) {
        return { state: 'IDLE', ctx: {}, replies: [this.backToMenu('No pude completar la reserva: el servicio ya no está disponible.')] };
      }
      throw error;
    }
  }

  async onChangeSlot(turn: Turn): Promise<FlowResult> {
    return this.askSlot(turn, { ...turn.ctx, slotStart: undefined, page: 0 });
  }

  onAbort(turn: Turn): FlowResult {
    const msg = turn.ctx.mode === 'reschedule' ? 'Perfecto, tu turno queda como estaba 👍' : 'Listo, no reservé nada 👍';
    return { state: 'IDLE', ctx: {}, replies: [this.backToMenu(msg)] };
  }

  /** Vuelve a mostrar el paso actual (cuando el cliente escribe en vez de tocar una opción). */
  async repeat(turn: Turn): Promise<FlowResult> {
    switch (turn.state) {
      case 'ASK_NAME':
        return this.start(turn);
      case 'PICK_SERVICE':
        return this.askService(turn, turn.ctx);
      case 'PICK_BARBER':
        return this.onService(turn, turn.ctx.serviceId!, turn.ctx);
      case 'PICK_DAY':
        return this.askDay(turn, turn.ctx);
      case 'PICK_SLOT':
        return this.askSlot(turn, turn.ctx);
      case 'CONFIRM':
        return this.askConfirm(turn, turn.ctx);
      default:
        throw new Error(`Estado sin repetición en BookingFlow: ${turn.state}`);
    }
  }

  backToMenu(body: string): OutgoingMessage {
    return buttons(body, [{ id: IDS.menu.HOME, title: 'Menú principal' }]);
  }

  withNotice(notice: string, result: FlowResult): FlowResult {
    return { ...result, replies: [text(notice), ...result.replies] };
  }

  private dayAvailability(barbershopId: string, ctx: BotContext) {
    return this.availability
      .getDay(barbershopId, { serviceId: ctx.serviceId!, date: ctx.date!, barberId: ctx.barberId ?? undefined })
      .catch((error: unknown) => {
        if (error instanceof BadRequestException || error instanceof NotFoundException) return null;
        throw error;
      });
  }

  private barbersFor(barbershopId: string, serviceId: string) {
    return this.prisma.barber.findMany({
      where: { barbershopId, isActive: true, services: { some: { serviceId } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
