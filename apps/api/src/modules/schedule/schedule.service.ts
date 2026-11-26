import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDaysToDate,
  localToUtc,
  timeToMinutes,
  utcToLocal,
} from '../../common/time.js';
import type { TimeOff } from '../../generated/prisma/client.js';
import type {
  CreateTimeOffInput,
  ListTimeOffsQuery,
  ReplaceWeekInput,
} from './schedule.schemas.js';
import type { TimeOffResponse, WeekResponse } from './schedule.types.js';

const MAX_TIME_OFF_DAYS = 366;

/**
 * Horarios de atención y bloqueos.
 * - barberId null = horario general de la barbería (aplica a todos los barberos sin horario propio).
 * - Las franjas semanales se guardan en hora local; los bloqueos como instantes UTC.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeek(barbershopId: string, barberId: string | null = null): Promise<WeekResponse> {
    const shop = await this.getShop(barbershopId);
    if (barberId) await this.assertBarber(barbershopId, barberId);

    const rows = await this.prisma.workingHours.findMany({
      where: { barbershopId, barberId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      ranges: rows
        .filter((r) => r.dayOfWeek === dayOfWeek)
        .map((r) => ({ startTime: r.startTime, endTime: r.endTime })),
    }));
    return { barberId, timezone: shop.timezone, days };
  }

  /** Reemplaza la semana completa de forma atómica. */
  async replaceWeek(barbershopId: string, input: ReplaceWeekInput): Promise<WeekResponse> {
    const barberId = input.barberId ?? null;
    if (barberId) await this.assertBarber(barbershopId, barberId);

    const data = input.days.flatMap((d) =>
      [...d.ranges]
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((r) => ({
          barbershopId,
          barberId,
          dayOfWeek: d.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
    );

    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { barbershopId, barberId } }),
      this.prisma.workingHours.createMany({ data }),
    ]);
    return this.getWeek(barbershopId, barberId);
  }

  async listTimeOffs(barbershopId: string, { from }: ListTimeOffsQuery): Promise<TimeOffResponse[]> {
    const shop = await this.getShop(barbershopId);
    const fromDate = from ?? utcToLocal(new Date(), shop.timezone).date;
    const fromInstant = localToUtc(fromDate, '00:00', shop.timezone);

    const rows = await this.prisma.timeOff.findMany({
      where: { barbershopId, endsAt: { gt: fromInstant } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((r) => this.toTimeOffResponse(r, shop.timezone));
  }

  async createTimeOff(barbershopId: string, input: CreateTimeOffInput): Promise<TimeOffResponse> {
    const shop = await this.getShop(barbershopId);
    const barberId = input.barberId ?? null;
    if (barberId) await this.assertBarber(barbershopId, barberId);

    const allDay = input.startTime === undefined;
    const startsAt = localToUtc(input.startDate, input.startTime ?? '00:00', shop.timezone);
    const endsAt = allDay
      ? localToUtc(addDaysToDate(input.endDate, 1), '00:00', shop.timezone)
      : localToUtc(input.endDate, input.endTime!, shop.timezone);

    if (endsAt <= startsAt) {
      throw new BadRequestException('El fin del bloqueo debe ser posterior al inicio');
    }
    if (endsAt.getTime() - startsAt.getTime() > MAX_TIME_OFF_DAYS * 86_400_000) {
      throw new BadRequestException('Un bloqueo no puede durar más de un año');
    }

    const created = await this.prisma.timeOff.create({
      data: { barbershopId, barberId, startsAt, endsAt, reason: input.reason || null },
    });

    // Avisamos si ya hay turnos tomados en ese período (no se cancelan solos)
    const conflictingAppointments = await this.prisma.appointment.count({
      where: {
        barbershopId,
        ...(barberId ? { barberId } : {}),
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });

    return { ...this.toTimeOffResponse(created, shop.timezone), conflictingAppointments };
  }

  async removeTimeOff(barbershopId: string, id: string): Promise<void> {
    const { count } = await this.prisma.timeOff.deleteMany({ where: { id, barbershopId } });
    if (count === 0) throw new NotFoundException('Bloqueo no encontrado');
  }

  private toTimeOffResponse(t: TimeOff, timezone: string): TimeOffResponse {
    const start = utcToLocal(t.startsAt, timezone);
    const end = utcToLocal(t.endsAt, timezone);
    const allDay = start.time === '00:00' && end.time === '00:00';
    return {
      id: t.id,
      barberId: t.barberId,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      startDate: start.date,
      // Día completo: el fin guardado es las 00:00 del día siguiente
      endDate: allDay ? addDaysToDate(end.date, -1) : end.date,
      startTime: allDay ? null : start.time,
      endTime: allDay ? null : end.time,
      allDay,
      reason: t.reason,
    };
  }

  private async getShop(barbershopId: string) {
    const shop = await this.prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true },
    });
    if (!shop) throw new NotFoundException('Barbería no encontrada');
    return shop;
  }

  private async assertBarber(barbershopId: string, barberId: string) {
    const barber = await this.prisma.barber.findFirst({
      where: { id: barberId, barbershopId },
      select: { id: true },
    });
    if (!barber) throw new NotFoundException('Barbero no encontrado');
  }
}
