import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { normalizePhone } from '../../../common/phone.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import { CustomersService } from '../../customers/customers.service.js';
import { ServicesService } from '../../services/services.service.js';
import { ScheduleService } from '../../schedule/schedule.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { BookingFlow } from './booking.flow.js';
import { ManageFlow } from './manage.flow.js';
import { buttons, list, text, type IncomingMessage, type OutgoingMessage } from './messages.js';
import { duration, firstName, mapsLink, price, weeklyHours } from './bot.presenter.js';
import {
  IDS,
  parseReply,
  type BotContext,
  type BotState,
  type FlowResult,
  type InboundEnvelope,
  type Turn,
} from './bot.types.js';

/** Pasados 30 minutos sin respuesta, el flujo en curso se descarta. */
export const SESSION_TIMEOUT_MS = 30 * 60_000;

const GREETINGS = new Set(['hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', 'inicio', 'hi', 'hello', 'volver', '0']);
const MENU_BY_NUMBER: Record<string, string> = {
  '1': IDS.menu.BOOK,
  '2': IDS.menu.MINE,
  '3': IDS.menu.RESCHEDULE,
  '4': IDS.menu.CANCEL,
  '5': IDS.menu.SERVICES,
  '6': IDS.menu.INFO,
};

const normalizeText = (t: string) =>
  t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[!¡?¿.,]/g, '').replace(/\s+/g, ' ');

/**
 * Cerebro del bot: descarta duplicados, recupera la conversación, decide qué hacer
 * con cada mensaje según el paso en que está el cliente y guarda el nuevo estado.
 * No sabe nada del transporte: recibe un mensaje y devuelve las respuestas.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly services: ServicesService,
    private readonly schedule: ScheduleService,
    private readonly booking: BookingFlow,
    private readonly manage: ManageFlow,
  ) {}

  async handleIncoming(barbershopId: string, envelope: InboundEnvelope): Promise<{ duplicate: boolean; replies: OutgoingMessage[] }> {
    const phone = normalizePhone(envelope.phone);
    if (!phone) throw new BadRequestException('Teléfono inválido');

    // Regla de negocio #5: Meta puede reenviar el mismo mensaje; se procesa una sola vez.
    try {
      await this.prisma.whatsappProcessedMessage.create({ data: { id: envelope.messageId, barbershopId } });
    } catch (error) {
      if (isUniqueViolation(error)) return { duplicate: true, replies: [] };
      throw error;
    }

    const conversation = await this.prisma.whatsappConversation.findUnique({
      where: { barbershopId_phone: { barbershopId, phone } },
    });
    const customer = await this.customers.findByPhone(barbershopId, phone);

    let state = (conversation?.state as BotState | undefined) ?? 'IDLE';
    let ctx = (conversation?.context as BotContext | undefined) ?? {};
    let expiredNotice = false;
    if (conversation && state !== 'IDLE' && Date.now() - conversation.lastMessageAt.getTime() > SESSION_TIMEOUT_MS) {
      state = 'IDLE';
      ctx = {};
      expiredNotice = envelope.message.type === 'reply' && !envelope.message.id.startsWith('MENU:');
    }

    const turn: Turn = {
      barbershopId,
      phone,
      profileName: envelope.profileName?.trim() || undefined,
      customer: customer ? { id: customer.id, name: customer.name } : null,
      state,
      ctx,
    };

    let result: FlowResult;
    try {
      result = expiredNotice
        ? await this.withPrefix('La conversación anterior expiró. Empecemos de nuevo 👇', this.menu(turn))
        : await this.route(turn, envelope.message);
    } catch (error) {
      this.logger.error(`Error del bot (${phone})`, error instanceof Error ? error.stack : String(error));
      result = { state: 'IDLE', ctx: {}, replies: [this.booking.backToMenu('Ups, algo salió mal de nuestro lado 😓 Probá de nuevo en un momento.')] };
    }

    await this.prisma.whatsappConversation.upsert({
      where: { barbershopId_phone: { barbershopId, phone } },
      update: { state: result.state, context: result.ctx as Prisma.InputJsonValue, lastMessageAt: new Date() },
      create: { barbershopId, phone, state: result.state, context: result.ctx as Prisma.InputJsonValue },
    });
    return { duplicate: false, replies: result.replies };
  }

  /** Borra el estado de una conversación (útil en el simulador). */
  async reset(barbershopId: string, rawPhone: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    if (phone) await this.prisma.whatsappConversation.deleteMany({ where: { barbershopId, phone } });
  }

  private async route(turn: Turn, message: IncomingMessage): Promise<FlowResult> {
    // Texto libre: saludos / "menú" / números del menú
    if (message.type === 'text') {
      const t = normalizeText(message.text);
      if (GREETINGS.has(t)) return this.menu(turn);
      if (turn.state === 'IDLE' && MENU_BY_NUMBER[t]) return this.menuOption(turn, MENU_BY_NUMBER[t]);
      if (turn.state === 'ASK_NAME') return this.booking.onName(turn, { text: message.text });
      if (turn.state === 'IDLE') return this.menu(turn);
      return this.withPrefix('Tocá una de las opciones 👇 (o escribí *menú* para volver al inicio)', this.repeat(turn));
    }

    const { prefix, value } = parseReply(message.id);
    if (prefix === 'MENU') return this.menuOption(turn, message.id);

    const expected: Partial<Record<BotState, string[]>> = {
      ASK_NAME: [IDS.useProfileName],
      PICK_SERVICE: ['SVC'],
      PICK_BARBER: ['BRB'],
      PICK_DAY: ['DAY'],
      PICK_SLOT: ['SLOT', 'MORE'],
      CONFIRM: [IDS.confirm, IDS.changeSlot, IDS.abort],
      PICK_APPOINTMENT: ['APPT'],
      CONFIRM_CANCEL: [IDS.cancelYes, IDS.cancelNo],
    };
    // Los IDs fijos (ej. NAME:PROFILE) se comparan completos; los dinámicos (SVC:<id>) por prefijo
    const key = expected[turn.state]?.includes(message.id) ? message.id : prefix;
    if (!expected[turn.state]?.includes(key)) {
      // Respuesta a un mensaje viejo (otra lista, otro paso)
      const current = turn.state === 'IDLE' ? this.menu(turn) : this.repeat(turn);
      return this.withPrefix('Esa opción es de un mensaje anterior. Seguimos desde acá 👇', current);
    }

    switch (key) {
      case IDS.useProfileName:
        return this.booking.onName(turn, { useProfile: true });
      case 'SVC':
        return this.booking.onService(turn, value);
      case 'BRB':
        return this.booking.onBarber(turn, value === 'ANY' ? null : value);
      case 'DAY':
        return this.booking.onDay(turn, value);
      case 'SLOT':
        return this.booking.onSlot(turn, value);
      case 'MORE':
        return this.booking.onMore(turn, Number(value));
      case IDS.confirm:
        return this.booking.onConfirm(turn);
      case IDS.changeSlot:
        return this.booking.onChangeSlot(turn);
      case IDS.abort:
        return this.booking.onAbort(turn);
      case 'APPT':
        return this.manage.onAppointment(turn, value);
      case IDS.cancelYes:
        return this.manage.onCancelYes(turn);
      default:
        return this.manage.onCancelNo();
    }
  }

  private async menuOption(turn: Turn, id: string): Promise<FlowResult> {
    const fresh: Turn = { ...turn, state: 'IDLE', ctx: {} };
    switch (id) {
      case IDS.menu.BOOK:
        return this.booking.start(fresh);
      case IDS.menu.MINE:
        return this.manage.myAppointments(fresh);
      case IDS.menu.RESCHEDULE:
        return this.manage.start(fresh, 'reschedule');
      case IDS.menu.CANCEL:
        return this.manage.start(fresh, 'cancel');
      case IDS.menu.SERVICES:
        return this.servicesInfo(fresh);
      case IDS.menu.INFO:
        return this.locationInfo(fresh);
      default:
        return this.menu(fresh);
    }
  }

  private async menu(turn: Turn): Promise<FlowResult> {
    const shop = await this.prisma.barbershop.findUnique({ where: { id: turn.barbershopId }, select: { name: true } });
    const name = turn.customer?.name ?? turn.profileName;
    const body = `¡Hola${name ? `, ${firstName(name)}` : ''}! 👋 Soy el asistente de turnos de ${shop?.name ?? 'la barbería'}.\n¿En qué te ayudo?`;
    return {
      state: 'IDLE',
      ctx: {},
      replies: [
        list(
          body,
          'Ver opciones',
          [
            {
              rows: [
                { id: IDS.menu.BOOK, title: 'Reservar turno', description: 'Elegí servicio, día y horario' },
                { id: IDS.menu.MINE, title: 'Mis turnos', description: 'Consultá tus próximos turnos' },
                { id: IDS.menu.RESCHEDULE, title: 'Cambiar un turno', description: 'Pasalo a otro día u horario' },
                { id: IDS.menu.CANCEL, title: 'Cancelar un turno' },
                { id: IDS.menu.SERVICES, title: 'Servicios y precios' },
                { id: IDS.menu.INFO, title: 'Ubicación y horarios' },
              ],
            },
          ],
          'Escribí "menú" para volver acá',
        ),
      ],
    };
  }

  private async servicesInfo(turn: Turn): Promise<FlowResult> {
    const active = await this.services.list(turn.barbershopId, { includeInactive: false });
    const lines = active.map((s) => `• ${s.name} — ${price(s.price)} (${duration(s.durationMinutes)})`);
    const body = active.length ? `💈 Servicios y precios:\n\n${lines.join('\n')}` : 'Todavía no hay servicios cargados.';
    return {
      state: 'IDLE',
      ctx: {},
      replies: [
        buttons(body, [
          { id: IDS.menu.BOOK, title: 'Reservar turno' },
          { id: IDS.menu.HOME, title: 'Menú principal' },
        ]),
      ],
    };
  }

  private async locationInfo(turn: Turn): Promise<FlowResult> {
    const [shop, week] = await Promise.all([
      this.prisma.barbershop.findUnique({ where: { id: turn.barbershopId }, select: { name: true, address: true, phone: true } }),
      this.schedule.getWeek(turn.barbershopId),
    ]);
    const parts = [`📍 ${shop?.name}`];
    if (shop?.address) parts.push(`${shop.address}\n${mapsLink(shop.address)}`);
    parts.push(`🕒 Horarios de atención:\n${weeklyHours(week.days)}`);
    return {
      state: 'IDLE',
      ctx: {},
      replies: [
        text(parts.join('\n\n')),
        buttons('¿Querés reservar?', [
          { id: IDS.menu.BOOK, title: 'Reservar turno' },
          { id: IDS.menu.HOME, title: 'Menú principal' },
        ]),
      ],
    };
  }

  private repeat(turn: Turn): Promise<FlowResult> {
    return turn.state === 'PICK_APPOINTMENT' || turn.state === 'CONFIRM_CANCEL'
      ? this.manage.repeat(turn)
      : this.booking.repeat(turn);
  }

  private async withPrefix(notice: string, result: Promise<FlowResult>): Promise<FlowResult> {
    const r = await result;
    return { ...r, replies: [text(notice), ...r.replies] };
  }
}
