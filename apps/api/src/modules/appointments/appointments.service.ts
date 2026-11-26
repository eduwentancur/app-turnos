import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isOverlapViolation } from '../../common/prisma-errors.js';
import { addDaysToDate, localToUtc, utcToLocal } from '../../common/time.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { CustomersService } from '../customers/customers.service.js';
import type { AppointmentSource } from '../../generated/prisma/enums.js';
import type { AppointmentResponse } from './appointments.types.js';
import type {
  CancelInput,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  RescheduleInput,
  StatusInput,
} from './appointments.schemas.js';

const include = {
  service: { select: { id: true, name: true, durationMinutes: true } },
  barber: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true, notes: true } },
} as const;

const ACTIVE = ['PENDING', 'CONFIRMED'] as const;
const MAX_RANGE_DAYS = 62;

export interface BookingOptions {
  /** El usuario puede reservar fuera del horario de atención (OWNER desde el panel). */
  canOverrideSchedule: boolean;
  source: AppointmentSource;
}

/**
 * Reglas de negocio de los turnos. Lo usan el panel y (en la Etapa 3) el bot de WhatsApp,
 * así que ninguna regla depende del canal.
 *
 * Doble protección contra reservas duplicadas:
 *  1. Antes de guardar se valida el horario contra la disponibilidad real.
 *  2. La exclusion constraint de PostgreSQL rechaza cualquier superposición que se cuele
 *     entre la validación y el insert (dos reservas simultáneas).
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly customers: CustomersService,
  ) {}

  async list(barbershopId: string, q: ListAppointmentsQuery): Promise<AppointmentResponse[]> {
    const tz = await this.timezone(barbershopId);
    const span = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException(`El rango no puede superar los ${MAX_RANGE_DAYS} días`);
    }

    const rows = await this.prisma.appointment.findMany({
      where: {
        barbershopId,
        startsAt: { gte: localToUtc(q.from, '00:00', tz), lt: localToUtc(addDaysToDate(q.to, 1), '00:00', tz) },
        ...(q.status ? { status: q.status } : q.includeCancelled ? {} : { status: { not: 'CANCELLED' } }),
        ...(q.barberId ? { barberId: q.barberId } : {}),
      },
      include,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((r) => this.toResponse(r, tz));
  }

  /** Próximos turnos activos de un cliente (para "Mis turnos" en WhatsApp). */
  async listUpcomingForCustomer(barbershopId: string, customerId: string, limit = 10): Promise<AppointmentResponse[]> {
    const tz = await this.timezone(barbershopId);
    const rows = await this.prisma.appointment.findMany({
      where: { barbershopId, customerId, status: { in: [...ACTIVE] }, startsAt: { gt: new Date() } },
      include,
      orderBy: { startsAt: 'asc' },
      take: limit,
    });
    return rows.map((r) => this.toResponse(r, tz));
  }

  async findOne(barbershopId: string, id: string): Promise<AppointmentResponse> {
    const tz = await this.timezone(barbershopId);
    return this.toResponse(await this.getOwned(barbershopId, id), tz);
  }

  async create(
    barbershopId: string,
    input: CreateAppointmentInput,
    options: BookingOptions,
  ): Promise<AppointmentResponse> {
    const tz = await this.timezone(barbershopId);
    const service = await this.prisma.service.findFirst({
      where: { id: input.serviceId, barbershopId, isActive: true },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado o inactivo');

    this.assertFuture(input.startsAt);
    const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
    const barberId = await this.resolveBarber(barbershopId, {
      serviceId: service.id,
      startsAt: input.startsAt,
      endsAt,
      barberId: input.barberId,
      outsideSchedule: Boolean(input.allowOutsideSchedule && options.canOverrideSchedule),
    });

    if (input.customerId) {
      const exists = await this.prisma.customer.count({ where: { id: input.customerId, barbershopId } });
      if (!exists) throw new NotFoundException('Cliente no encontrado');
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const customerId =
          input.customerId ?? (await this.customers.findOrCreate(barbershopId, input.customer!, tx)).id;
        return tx.appointment.create({
          data: {
            barbershopId,
            customerId,
            barberId,
            serviceId: service.id,
            startsAt: input.startsAt,
            endsAt,
            priceAtBooking: service.price,
            status: 'CONFIRMED',
            source: options.source,
            notes: input.notes || null,
            guestName: input.guestName || null,
          },
          include,
        });
      });
      return this.toResponse(created, tz);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async reschedule(
    barbershopId: string,
    id: string,
    input: RescheduleInput,
    options: Pick<BookingOptions, 'canOverrideSchedule'>,
  ): Promise<AppointmentResponse> {
    const tz = await this.timezone(barbershopId);
    const current = await this.getOwned(barbershopId, id);
    this.assertActive(current.status);
    this.assertFuture(input.startsAt);

    const endsAt = new Date(input.startsAt.getTime() + current.service.durationMinutes * 60_000);
    const barberId = await this.resolveBarber(barbershopId, {
      serviceId: current.serviceId,
      startsAt: input.startsAt,
      endsAt,
      barberId: input.barberId,
      outsideSchedule: Boolean(input.allowOutsideSchedule && options.canOverrideSchedule),
      ignoreAppointmentId: id,
    });

    try {
      const updated = await this.prisma.appointment.update({
        where: { id },
        data: { startsAt: input.startsAt, endsAt, barberId },
        include,
      });
      return this.toResponse(updated, tz);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Reserva varios turnos seguidos con el mismo barbero (ej. padre e hijo).
   * Todo o nada: si no entran todos, no se reserva ninguno.
   */
  async createGroup(
    barbershopId: string,
    input: {
      startsAt: Date;
      customer: { name: string; phone: string };
      people: { serviceId: string; guestName: string | null }[];
      barberId?: string;
    },
    options: Pick<BookingOptions, 'source'>,
  ): Promise<AppointmentResponse[]> {
    if (input.people.length < 1 || input.people.length > 5) {
      throw new BadRequestException('Un turno en grupo admite de 1 a 5 personas');
    }
    const tz = await this.timezone(barbershopId);
    this.assertFuture(input.startsAt);

    const ids = input.people.map((p) => p.serviceId);
    const services = await this.prisma.service.findMany({ where: { id: { in: ids }, barbershopId, isActive: true } });
    const byId = new Map(services.map((s) => [s.id, s]));
    if (ids.some((id) => !byId.has(id))) throw new NotFoundException('Servicio no encontrado o inactivo');

    const free = await this.availability.findFreeBarbers(barbershopId, {
      serviceId: ids[0],
      extraServiceIds: ids.slice(1),
      startsAt: input.startsAt,
      barberId: input.barberId,
    });
    if (free.length === 0) {
      throw new ConflictException('No hay lugar para todos seguidos en ese horario. Elegí otro.');
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const customer = await this.customers.findOrCreate(barbershopId, input.customer, tx);
        const groupId = randomUUID();
        const rows = [];
        let cursor = input.startsAt.getTime();
        for (const person of input.people) {
          const service = byId.get(person.serviceId)!;
          const startsAt = new Date(cursor);
          cursor += service.durationMinutes * 60_000;
          rows.push(
            await tx.appointment.create({
              data: {
                barbershopId,
                customerId: customer.id,
                barberId: free[0],
                serviceId: service.id,
                startsAt,
                endsAt: new Date(cursor),
                priceAtBooking: service.price,
                status: 'CONFIRMED',
                source: options.source,
                guestName: person.guestName,
                groupId,
              },
              include,
            }),
          );
        }
        return rows;
      });
      return created.map((a) => this.toResponse(a, tz));
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Turnos activos de un grupo, en orden. */
  async listGroup(barbershopId: string, groupId: string): Promise<AppointmentResponse[]> {
    const tz = await this.timezone(barbershopId);
    const rows = await this.prisma.appointment.findMany({
      where: { barbershopId, groupId, status: { in: [...ACTIVE] } },
      include,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((r) => this.toResponse(r, tz));
  }

  /** Mueve todo el grupo a un nuevo horario de inicio, manteniendo el orden. */
  async rescheduleGroup(barbershopId: string, groupId: string, startsAt: Date): Promise<AppointmentResponse[]> {
    const tz = await this.timezone(barbershopId);
    const current = await this.prisma.appointment.findMany({
      where: { barbershopId, groupId, status: { in: [...ACTIVE] } },
      include,
      orderBy: { startsAt: 'asc' },
    });
    if (current.length === 0) throw new NotFoundException('Turnos no encontrados');
    this.assertFuture(startsAt);

    const free = await this.availability.findFreeBarbers(barbershopId, {
      serviceId: current[0].serviceId,
      extraServiceIds: current.slice(1).map((a) => a.serviceId),
      startsAt,
      ignoreAppointmentIds: current.map((a) => a.id),
    });
    if (free.length === 0) throw new ConflictException('No hay lugar para todos seguidos en ese horario. Elegí otro.');

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Primero se "estacionan" en horarios ficticios distintos (1970) para que la constraint
        // anti-superposición no choque con el propio grupo mientras se reacomodan
        for (const [i, a] of current.entries()) {
          await tx.appointment.update({
            where: { id: a.id },
            data: { startsAt: new Date(i * 60_000), endsAt: new Date(i * 60_000 + 1_000) },
          });
        }
        const rows = [];
        let cursor = startsAt.getTime();
        for (const a of current) {
          const s = new Date(cursor);
          cursor += a.service.durationMinutes * 60_000;
          rows.push(
            await tx.appointment.update({
              where: { id: a.id },
              data: { startsAt: s, endsAt: new Date(cursor), barberId: free[0] },
              include,
            }),
          );
        }
        return rows;
      });
      return updated.map((a) => this.toResponse(a, tz));
    } catch (error) {
      throw this.translate(error);
    }
  }

  async cancelGroup(barbershopId: string, groupId: string, input: CancelInput): Promise<AppointmentResponse[]> {
    const active = await this.listGroup(barbershopId, groupId);
    if (active.length === 0) throw new ConflictException('No hay turnos activos en ese grupo');
    const results = [];
    for (const a of active) results.push(await this.cancel(barbershopId, a.id, input));
    return results;
  }

  /** Cancela y libera el horario (la constraint solo considera turnos activos). */
  async cancel(barbershopId: string, id: string, input: CancelInput): Promise<AppointmentResponse> {
    const tz = await this.timezone(barbershopId);
    const current = await this.getOwned(barbershopId, id);
    this.assertActive(current.status);

    const notes = input.reason
      ? [current.notes, `Cancelado: ${input.reason}`].filter(Boolean).join('\n')
      : current.notes;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), notes },
      include,
    });
    return this.toResponse(updated, tz);
  }

  async setStatus(barbershopId: string, id: string, { status }: StatusInput): Promise<AppointmentResponse> {
    const tz = await this.timezone(barbershopId);
    const current = await this.getOwned(barbershopId, id);
    if (current.status === 'CANCELLED') {
      throw new ConflictException('El turno está cancelado');
    }
    if ((status === 'COMPLETED' || status === 'NO_SHOW') && current.startsAt > new Date()) {
      throw new BadRequestException('Todavía no llegó la hora del turno');
    }
    const updated = await this.prisma.appointment.update({ where: { id }, data: { status }, include });
    return this.toResponse(updated, tz);
  }

  /** Decide qué barbero atiende y valida que el horario esté libre. */
  private async resolveBarber(
    barbershopId: string,
    p: {
      serviceId: string;
      startsAt: Date;
      endsAt: Date;
      barberId?: string;
      outsideSchedule: boolean;
      ignoreAppointmentId?: string;
    },
  ): Promise<string> {
    if (!p.outsideSchedule) {
      const free = await this.availability.findFreeBarbers(barbershopId, {
        serviceId: p.serviceId,
        startsAt: p.startsAt,
        barberId: p.barberId,
        ignoreAppointmentId: p.ignoreAppointmentId,
      });
      if (free.length === 0) {
        throw new ConflictException('Ese horario no está disponible. Elegí otro de la lista.');
      }
      return free[0];
    }

    // Fuera de horario: solo se exige que el barbero haga el servicio y no tenga otro turno
    const candidates = await this.prisma.barber.findMany({
      where: {
        barbershopId,
        isActive: true,
        services: { some: { serviceId: p.serviceId } },
        ...(p.barberId ? { id: p.barberId } : {}),
      },
      select: { id: true },
    });
    for (const { id } of candidates) {
      const clash = await this.prisma.appointment.count({
        where: {
          barberId: id,
          status: { in: [...ACTIVE] },
          startsAt: { lt: p.endsAt },
          endsAt: { gt: p.startsAt },
          ...(p.ignoreAppointmentId ? { id: { not: p.ignoreAppointmentId } } : {}),
        },
      });
      if (clash === 0) return id;
    }
    throw new ConflictException(
      candidates.length ? 'El barbero ya tiene un turno en ese horario' : 'Ningún barbero realiza este servicio',
    );
  }

  private assertFuture(startsAt: Date): void {
    if (startsAt.getTime() < Date.now()) throw new BadRequestException('No se puede reservar en el pasado');
  }

  private assertActive(status: string): void {
    if (!ACTIVE.includes(status as (typeof ACTIVE)[number])) {
      throw new ConflictException('Solo se pueden modificar turnos pendientes o confirmados');
    }
  }

  private async getOwned(barbershopId: string, id: string) {
    const row = await this.prisma.appointment.findFirst({ where: { id, barbershopId }, include });
    if (!row) throw new NotFoundException('Turno no encontrado');
    return row;
  }

  private async timezone(barbershopId: string): Promise<string> {
    const shop = await this.prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true },
    });
    if (!shop) throw new NotFoundException('Barbería no encontrada');
    return shop.timezone;
  }

  private translate(error: unknown): unknown {
    if (isOverlapViolation(error)) {
      return new ConflictException('Ese horario se acaba de ocupar. Elegí otro.');
    }
    return error;
  }

  private toResponse(
    a: Awaited<ReturnType<AppointmentsService['getOwned']>>,
    tz: string,
  ): AppointmentResponse {
    const start = utcToLocal(a.startsAt, tz);
    return {
      id: a.id,
      status: a.status,
      source: a.source,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      localDate: start.date,
      localStart: start.time,
      localEnd: utcToLocal(a.endsAt, tz).time,
      service: a.service,
      barber: a.barber,
      customer: a.customer,
      price: Number(a.priceAtBooking.toString()),
      notes: a.notes,
      guestName: a.guestName,
      groupId: a.groupId,
      cancelledAt: a.cancelledAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
