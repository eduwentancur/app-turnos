import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from '../../appointments/appointments.service.js';
import type { AppointmentResponse } from '../../appointments/appointments.types.js';
import { BookingFlow } from './booking.flow.js';
import { buttons, list, LIMITS } from './messages.js';
import { shortDate } from './bot.presenter.js';
import { IDS, prefixed, type BotContext, type FlowResult, type Turn } from './bot.types.js';

/** "Mis turnos", "Cambiar un turno" y "Cancelar un turno". */
@Injectable()
export class ManageFlow {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly booking: BookingFlow,
  ) {}

  async myAppointments(turn: Turn): Promise<FlowResult> {
    const upcoming = await this.upcoming(turn);
    if (upcoming.length === 0) {
      return {
        state: 'IDLE',
        ctx: {},
        replies: [
          buttons('No tenés turnos reservados.', [
            { id: IDS.menu.BOOK, title: 'Reservar turno' },
            { id: IDS.menu.HOME, title: 'Menú principal' },
          ]),
        ],
      };
    }
    const lines = upcoming.map(
      (a) => `• ${shortDate(a.localDate)} ${a.localStart} — ${a.service.name}${a.guestName ? ` (${a.guestName})` : ''} con ${a.barber.name}`,
    );
    return {
      state: 'IDLE',
      ctx: {},
      replies: [
        buttons(`Tus próximos turnos:\n\n${lines.join('\n')}`, [
          { id: IDS.menu.RESCHEDULE, title: 'Cambiar un turno' },
          { id: IDS.menu.CANCEL, title: 'Cancelar un turno' },
          { id: IDS.menu.HOME, title: 'Menú principal' },
        ]),
      ],
    };
  }

  /** Inicio de cambiar / cancelar: elegir cuál turno (si hay uno solo, se usa directamente). */
  async start(turn: Turn, mode: 'reschedule' | 'cancel', pref?: BotContext['pref']): Promise<FlowResult> {
    const upcoming = await this.upcoming(turn);
    const verb = mode === 'cancel' ? 'cancelar' : 'cambiar';
    if (upcoming.length === 0) {
      return {
        state: 'IDLE',
        ctx: {},
        replies: [
          buttons(`No tenés turnos para ${verb}.`, [
            { id: IDS.menu.BOOK, title: 'Reservar turno' },
            { id: IDS.menu.HOME, title: 'Menú principal' },
          ]),
        ],
      };
    }
    // Un solo turno, o todos son de la misma reserva en grupo: se va directo
    const reservations = new Set(upcoming.map((a) => a.groupId ?? a.id));
    if (reservations.size === 1) return this.selected({ ...turn, ctx: { mode, pref } }, upcoming[0]);

    const rows = upcoming.slice(0, LIMITS.rowsPerList).map((a) => ({
      id: prefixed('APPT', a.id),
      title: `${shortDate(a.localDate)} ${a.localStart}`,
      description: `${a.service.name}${a.guestName ? ` · ${a.guestName}` : ''} con ${a.barber.name}`,
    }));
    return {
      state: 'PICK_APPOINTMENT',
      ctx: { mode, pref },
      replies: [list(`¿Qué turno querés ${verb}?`, 'Ver mis turnos', [{ rows }])],
    };
  }

  async onAppointment(turn: Turn, appointmentId: string): Promise<FlowResult> {
    const appointment = (await this.upcoming(turn)).find((a) => a.id === appointmentId);
    if (!appointment) {
      return this.booking.withNotice('Ese turno ya no está vigente.', await this.start(turn, turn.ctx.mode === 'cancel' ? 'cancel' : 'reschedule'));
    }
    return this.selected(turn, appointment);
  }

  /** Turno que es parte de un grupo: aplicar a todos o solo a ese. */
  async onScope(turn: Turn, scope: 'all' | 'one'): Promise<FlowResult> {
    const appointment = (await this.upcoming(turn)).find((a) => a.id === turn.ctx.appointmentId);
    if (!appointment) return this.start(turn, turn.ctx.mode === 'cancel' ? 'cancel' : 'reschedule');
    if (scope === 'one' || !appointment.groupId) return this.selected({ ...turn, ctx: { ...turn.ctx, scope: 'one' } }, appointment);

    const group = await this.appointments.listGroup(turn.barbershopId, appointment.groupId);
    const lines = group.map((a) => `• ${a.localStart} ${a.guestName ?? a.customer.name} — ${a.service.name}`).join('\n');
    if (turn.ctx.mode === 'cancel') {
      return {
        state: 'CONFIRM_CANCEL',
        ctx: { mode: 'cancel', appointmentId: appointment.id, groupId: appointment.groupId, scope: 'all' },
        replies: [
          buttons(`¿Seguro que querés cancelar estos turnos del ${shortDate(appointment.localDate)}?\n\n${lines}`, [
            { id: IDS.cancelYes, title: 'Sí, cancelar todos' },
            { id: IDS.cancelNo, title: 'No, mantener' },
          ]),
        ],
      };
    }
    return this.booking.advance(turn, {
      mode: 'reschedule',
      scope: 'all',
      groupId: appointment.groupId,
      appointmentId: appointment.id,
      serviceId: group[0].service.id,
      customerName: group[0].guestName ?? group[0].customer.name,
      guests: group.slice(1).map((g) => ({ name: g.guestName ?? g.customer.name, serviceId: g.service.id })),
      ignoreIds: group.map((g) => g.id),
      barberId: null,
      pref: turn.ctx.pref,
    });
  }

  async onCancelYes(turn: Turn): Promise<FlowResult> {
    if (turn.ctx.scope === 'all' && turn.ctx.groupId) {
      try {
        const cancelled = await this.appointments.cancelGroup(turn.barbershopId, turn.ctx.groupId, {
          reason: 'Cancelado por el cliente desde WhatsApp',
        });
        return {
          state: 'IDLE',
          ctx: {},
          replies: [
            this.booking.backToMenu(
              `Listo, se cancelaron ${cancelled.length} turnos del ${shortDate(cancelled[0].localDate)}. ¡Gracias por avisar! 🙌`,
            ),
          ],
        };
      } catch (error) {
        if (error instanceof ConflictException) {
          return { state: 'IDLE', ctx: {}, replies: [this.booking.backToMenu('Esos turnos ya no estaban activos.')] };
        }
        throw error;
      }
    }
    try {
      const appointment = (await this.upcoming(turn)).find((a) => a.id === turn.ctx.appointmentId);
      if (!appointment) throw new NotFoundException();
      const cancelled = await this.appointments.cancel(turn.barbershopId, appointment.id, {
        reason: 'Cancelado por el cliente desde WhatsApp',
      });
      return {
        state: 'IDLE',
        ctx: {},
        replies: [
          this.booking.backToMenu(
            `Listo, tu turno del ${shortDate(cancelled.localDate)} a las ${cancelled.localStart} quedó cancelado. ¡Gracias por avisar! 🙌`,
          ),
        ],
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        return { state: 'IDLE', ctx: {}, replies: [this.booking.backToMenu('Ese turno ya no estaba activo.')] };
      }
      throw error;
    }
  }

  onCancelNo(): FlowResult {
    return { state: 'IDLE', ctx: {}, replies: [this.booking.backToMenu('Perfecto, tu turno sigue en pie 👍')] };
  }

  async repeat(turn: Turn): Promise<FlowResult> {
    if (turn.state === 'CONFIRM_SCOPE' && turn.ctx.appointmentId) {
      return this.onAppointment({ ...turn, ctx: { ...turn.ctx, scope: undefined } }, turn.ctx.appointmentId);
    }
    if (turn.state === 'CONFIRM_CANCEL' && turn.ctx.appointmentId) {
      return this.onAppointment(turn, turn.ctx.appointmentId);
    }
    return this.start(turn, turn.ctx.mode === 'cancel' ? 'cancel' : 'reschedule');
  }

  private async selected(turn: Turn, a: AppointmentResponse): Promise<FlowResult> {
    // Parte de un grupo (ej. padre e hijo): ¿a todos o solo a este?
    if (a.groupId && !turn.ctx.scope) {
      const group = await this.appointments.listGroup(turn.barbershopId, a.groupId);
      if (group.length > 1) {
        const who = a.guestName ?? 'vos';
        const cancel = turn.ctx.mode === 'cancel';
        return {
          state: 'CONFIRM_SCOPE',
          ctx: { mode: turn.ctx.mode, appointmentId: a.id, groupId: a.groupId, pref: turn.ctx.pref },
          replies: [
            buttons(
              `Ese turno del ${shortDate(a.localDate)} es parte de una reserva de ${group.length} personas. ¿Qué querés ${cancel ? 'cancelar' : 'cambiar'}?`,
              [
                { id: IDS.scopeAll, title: cancel ? 'Cancelar todos' : 'Cambiar todos' },
                { id: IDS.scopeOne, title: `Solo ${who === 'vos' ? 'el mío' : `el de ${who}`}` },
                ...(cancel ? [{ id: IDS.cancelNo, title: 'No, mantener' }] : []),
              ],
            ),
          ],
        };
      }
    }
    if (turn.ctx.mode === 'cancel') {
      return {
        state: 'CONFIRM_CANCEL',
        ctx: { mode: 'cancel', appointmentId: a.id, scope: turn.ctx.scope },
        replies: [
          buttons(
            `¿Seguro que querés cancelar ${a.guestName ? `el turno de ${a.guestName}` : 'tu turno'}?\n\n${a.service.name}\n${shortDate(a.localDate)} a las ${a.localStart}\ncon ${a.barber.name}`,
            [
              { id: IDS.cancelYes, title: 'Sí, cancelar' },
              { id: IDS.cancelNo, title: 'No, mantener' },
            ],
          ),
        ],
      };
    }
    return this.booking.advance(turn, {
      mode: 'reschedule',
      scope: 'one',
      appointmentId: a.id,
      serviceId: a.service.id,
      barberId: null,
      customerName: a.customer.name,
      pref: turn.ctx.pref,
    });
  }

  private async upcoming(turn: Turn): Promise<AppointmentResponse[]> {
    if (!turn.customer) return [];
    return this.appointments.listUpcomingForCustomer(turn.barbershopId, turn.customer.id);
  }
}
