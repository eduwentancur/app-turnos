import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { addDaysToDate, localToUtc, utcToLocal } from '../../common/time.js';
import {
  calculateSlots,
  groupByPeriod,
  type BarberDaySchedule,
  type Interval,
  type Slot,
} from './slot-calculator.js';
import type {
  DayAvailabilityResponse,
  DaysAvailabilityResponse,
  SlotResponse,
} from './availability.types.js';

/** No se ofrecen turnos que empiecen dentro de los próximos N minutos. */
export const MIN_LEAD_MINUTES = 30;
/** Hasta cuántos días hacia adelante se puede reservar. */
export const MAX_DAYS_AHEAD = 60;

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

interface BarberContext {
  barberId: string;
  /** Franjas por día de la semana (0-6), propias del barbero o generales de la barbería */
  weekly: Map<number, { startTime: string; endTime: string }[]>;
  busy: Interval[];
}

interface Context {
  timezone: string;
  stepMinutes: number;
  cuts: { afternoonStartsAt: string; eveningStartsAt: string };
  service: { id: string; name: string; durationMinutes: number; price: number };
  barbers: BarberContext[];
}

const dayOfWeekOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * Disponibilidad real: cruza horarios de atención, bloqueos, turnos activos,
 * duración del servicio y anticipación mínima. Carga los datos de todo el rango
 * en pocas consultas y calcula en memoria con `calculateSlots`.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getDay(
    barbershopId: string,
    query: { serviceId: string; date: string; barberId?: string },
  ): Promise<DayAvailabilityResponse> {
    const ctx = await this.loadContext(barbershopId, query.serviceId, query.barberId, query.date, query.date);
    this.assertBookableDate(query.date, ctx.timezone);

    const slots = this.slotsFor(ctx, query.date);
    return {
      date: query.date,
      timezone: ctx.timezone,
      service: ctx.service,
      periods: groupByPeriod(slots, ctx.cuts).map((p) => ({
        key: p.key,
        label: p.label,
        slots: p.slots.map(toSlotResponse),
      })),
      totalSlots: slots.length,
    };
  }

  async getDays(
    barbershopId: string,
    query: { serviceId: string; from?: string; days: number; barberId?: string },
  ): Promise<DaysAvailabilityResponse> {
    const shop = await this.getShop(barbershopId);
    const today = utcToLocal(new Date(), shop.timezone).date;
    const from = query.from && query.from > today ? query.from : today;
    const lastAllowed = addDaysToDate(today, MAX_DAYS_AHEAD);
    const to = [addDaysToDate(from, query.days - 1), lastAllowed].sort()[0];
    if (from > lastAllowed) {
      throw new BadRequestException(`Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días adelante`);
    }

    const ctx = await this.loadContext(barbershopId, query.serviceId, query.barberId, from, to);
    const days = [];
    for (let date = from; date <= to; date = addDaysToDate(date, 1)) {
      days.push({ date, dayOfWeek: dayOfWeekOf(date), availableSlots: this.slotsFor(ctx, date).length });
    }
    return { timezone: ctx.timezone, service: ctx.service, days };
  }

  /**
   * Verifica si un horario puntual está libre. Devuelve los barberos que pueden atenderlo
   * (vacío si no está disponible). Se usa al crear o reprogramar un turno.
   * `ignoreAppointmentId` permite excluir el propio turno al reprogramarlo.
   */
  async findFreeBarbers(
    barbershopId: string,
    params: { serviceId: string; startsAt: Date; barberId?: string; ignoreAppointmentId?: string },
  ): Promise<string[]> {
    const shop = await this.getShop(barbershopId);
    const date = utcToLocal(params.startsAt, shop.timezone).date;
    const ctx = await this.loadContext(
      barbershopId,
      params.serviceId,
      params.barberId,
      date,
      date,
      params.ignoreAppointmentId,
    );
    const slot = this.slotsFor(ctx, date).find((s) => s.start.getTime() === params.startsAt.getTime());
    return slot?.barberIds ?? [];
  }

  private slotsFor(ctx: Context, date: string): Slot[] {
    const dow = dayOfWeekOf(date);
    const barbers: BarberDaySchedule[] = ctx.barbers.map((b) => ({
      barberId: b.barberId,
      ranges: b.weekly.get(dow) ?? [],
      busy: b.busy,
    }));
    return calculateSlots({
      date,
      timezone: ctx.timezone,
      durationMinutes: ctx.service.durationMinutes,
      stepMinutes: ctx.stepMinutes,
      notBefore: new Date(Date.now() + MIN_LEAD_MINUTES * 60_000),
      barbers,
    });
  }

  private async loadContext(
    barbershopId: string,
    serviceId: string,
    barberId: string | undefined,
    fromDate: string,
    toDate: string,
    ignoreAppointmentId?: string,
  ): Promise<Context> {
    const shop = await this.getShop(barbershopId);

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, barbershopId, isActive: true },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado o inactivo');

    const barbers = await this.prisma.barber.findMany({
      where: {
        barbershopId,
        isActive: true,
        services: { some: { serviceId } },
        ...(barberId ? { id: barberId } : {}),
      },
      select: { id: true },
    });
    if (barberId && barbers.length === 0) {
      throw new NotFoundException('El barbero no existe o no realiza este servicio');
    }

    const barberIds = barbers.map((b) => b.id);
    const rangeStart = localToUtc(fromDate, '00:00', shop.timezone);
    const rangeEnd = localToUtc(addDaysToDate(toDate, 1), '00:00', shop.timezone);

    const [hours, appointments, timeOffs] = await Promise.all([
      this.prisma.workingHours.findMany({
        where: { barbershopId, OR: [{ barberId: null }, { barberId: { in: barberIds } }] },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: {
          barbershopId,
          barberId: { in: barberIds },
          status: { in: [...ACTIVE_STATUSES] },
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
          ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
        },
        select: { barberId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.timeOff.findMany({
        where: {
          barbershopId,
          OR: [{ barberId: null }, { barberId: { in: barberIds } }],
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
        },
        select: { barberId: true, startsAt: true, endsAt: true },
      }),
    ]);

    const toWeekly = (rows: typeof hours) => {
      const map = new Map<number, { startTime: string; endTime: string }[]>();
      for (const r of rows) {
        map.set(r.dayOfWeek, [...(map.get(r.dayOfWeek) ?? []), { startTime: r.startTime, endTime: r.endTime }]);
      }
      return map;
    };
    const general = toWeekly(hours.filter((h) => h.barberId === null));

    return {
      timezone: shop.timezone,
      stepMinutes: shop.slotStepMinutes,
      cuts: { afternoonStartsAt: shop.afternoonStartsAt, eveningStartsAt: shop.eveningStartsAt },
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: Number(service.price.toString()),
      },
      barbers: barberIds.map((id) => {
        const own = hours.filter((h) => h.barberId === id);
        return {
          barberId: id,
          // Si el barbero tiene horario propio se usa ese; si no, el general de la barbería
          weekly: own.length ? toWeekly(own) : general,
          busy: [
            ...appointments.filter((a) => a.barberId === id),
            ...timeOffs.filter((t) => t.barberId === null || t.barberId === id),
          ].map((x) => ({ start: x.startsAt, end: x.endsAt })),
        };
      }),
    };
  }

  private assertBookableDate(date: string, timezone: string): void {
    const today = utcToLocal(new Date(), timezone).date;
    if (date < today) throw new BadRequestException('La fecha ya pasó');
    if (date > addDaysToDate(today, MAX_DAYS_AHEAD)) {
      throw new BadRequestException(`Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días adelante`);
    }
  }

  private async getShop(barbershopId: string) {
    const shop = await this.prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true, slotStepMinutes: true, afternoonStartsAt: true, eveningStartsAt: true },
    });
    if (!shop) throw new NotFoundException('Barbería no encontrada');
    return shop;
  }
}

function toSlotResponse(s: Slot): SlotResponse {
  return {
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    localTime: s.localTime,
    barberIds: s.barberIds,
  };
}
