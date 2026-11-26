import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizePhone } from '../../common/phone.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';
import { utcToLocal } from '../../common/time.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppointmentStatus } from '../../generated/prisma/enums.js';
import type { ListCustomersQuery, UpdateCustomerInput } from './customers.schemas.js';

export interface CustomerResponse {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
}

export interface CustomerStats {
  /** Turnos pasados no cancelados ni marcados como "no vino" */
  visits: number;
  totalSpent: number;
  cancellations: number;
  noShows: number;
  lastVisit: string | null;
  nextAppointment: { id: string; startsAt: string; localDate: string; localStart: string } | null;
}

export type CustomerSummary = CustomerResponse & CustomerStats & { createdAt: string };

export interface CustomerHistoryItem {
  id: string;
  status: AppointmentStatus;
  startsAt: string;
  localDate: string;
  localStart: string;
  service: string;
  barber: string;
  price: number;
  guestName: string | null;
}

export type CustomerDetail = CustomerSummary & { history: CustomerHistoryItem[] };

export interface CustomerPage {
  items: CustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

type Tx = Prisma.TransactionClient;

interface ApptRow {
  id: string;
  customerId: string;
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  priceAtBooking: Prisma.Decimal;
}

const select = { id: true, name: true, phone: true, notes: true, createdAt: true } as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista con estadísticas. Se calculan en memoria sobre los turnos de los clientes
   * filtrados: alcanza de sobra para el volumen de una barbería (miles de clientes).
   */
  async list(barbershopId: string, q: ListCustomersQuery): Promise<CustomerPage> {
    const tz = await this.timezone(barbershopId);
    const customers = await this.prisma.customer.findMany({
      where: { barbershopId, ...this.searchFilter(q.search) },
      select,
    });
    const appts = await this.appointmentsOf(customers.map((c) => c.id));
    const now = new Date();

    const items = customers.map((c) => ({
      ...this.toResponse(c),
      ...this.stats(appts.filter((a) => a.customerId === c.id), now, tz),
      createdAt: c.createdAt.toISOString(),
    }));

    const time = (v: string | null) => (v ? Date.parse(v) : 0);
    const sorters: Record<ListCustomersQuery['sort'], (a: CustomerSummary, b: CustomerSummary) => number> = {
      recent: (a, b) => time(b.lastVisit) - time(a.lastVisit) || a.name.localeCompare(b.name),
      frequent: (a, b) => b.visits - a.visits || a.name.localeCompare(b.name),
      // Clientes con visitas, de la más antigua a la más reciente (y sin próximo turno primero)
      inactive: (a, b) =>
        Number(Boolean(a.nextAppointment)) - Number(Boolean(b.nextAppointment)) ||
        (time(a.lastVisit) || Infinity) - (time(b.lastVisit) || Infinity),
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
    };
    items.sort(sorters[q.sort]);

    const start = (q.page - 1) * q.pageSize;
    return { items: items.slice(start, start + q.pageSize), total: items.length, page: q.page, pageSize: q.pageSize };
  }

  async findOne(barbershopId: string, id: string): Promise<CustomerDetail> {
    const tz = await this.timezone(barbershopId);
    const customer = await this.prisma.customer.findFirst({ where: { id, barbershopId }, select });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const appts = await this.prisma.appointment.findMany({
      where: { customerId: id },
      include: { service: { select: { name: true } }, barber: { select: { name: true } } },
      orderBy: { startsAt: 'desc' },
    });

    return {
      ...this.toResponse(customer),
      ...this.stats(appts, new Date(), tz),
      createdAt: customer.createdAt.toISOString(),
      history: appts.map((a) => {
        const local = utcToLocal(a.startsAt, tz);
        return {
          id: a.id,
          status: a.status,
          startsAt: a.startsAt.toISOString(),
          localDate: local.date,
          localStart: local.time,
          service: a.service.name,
          barber: a.barber.name,
          price: Number(a.priceAtBooking.toString()),
          guestName: a.guestName,
        };
      }),
    };
  }

  async update(barbershopId: string, id: string, input: UpdateCustomerInput): Promise<CustomerResponse> {
    const exists = await this.prisma.customer.count({ where: { id, barbershopId } });
    if (!exists) throw new NotFoundException('Cliente no encontrado');

    let phone: string | undefined;
    if (input.phone !== undefined) {
      phone = normalizePhone(input.phone) ?? undefined;
      if (!phone) throw new BadRequestException('Teléfono inválido');
    }

    try {
      const updated = await this.prisma.customer.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(phone ? { phone } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        select,
      });
      return this.toResponse(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya hay otro cliente con ese teléfono');
      throw error;
    }
  }

  /** Cliente por teléfono (cualquier formato), o null si no existe. */
  async findByPhone(barbershopId: string, rawPhone: string): Promise<CustomerResponse | null> {
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;
    return this.prisma.customer.findUnique({
      where: { barbershopId_phone: { barbershopId, phone } },
      select: { id: true, name: true, phone: true, notes: true },
    });
  }

  /**
   * Busca el cliente por teléfono y lo crea si no existe (el teléfono es la identidad,
   * igual que en WhatsApp). Si ya existe y llega otro nombre, se actualiza.
   */
  async findOrCreate(
    barbershopId: string,
    input: { name: string; phone: string },
    tx: Tx = this.prisma,
  ): Promise<CustomerResponse> {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new BadRequestException('Teléfono inválido');
    const name = input.name.trim();

    return tx.customer.upsert({
      where: { barbershopId_phone: { barbershopId, phone } },
      update: name ? { name } : {},
      create: { barbershopId, phone, name },
      select: { id: true, name: true, phone: true, notes: true },
    });
  }

  private stats(appts: ApptRow[], now: Date, tz: string): CustomerStats {
    const past = appts.filter((a) => a.endsAt <= now);
    const visits = past.filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW');
    const upcoming = appts
      .filter((a) => a.startsAt > now && (a.status === 'PENDING' || a.status === 'CONFIRMED'))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const last = visits.reduce<Date | null>((max, a) => (!max || a.startsAt > max ? a.startsAt : max), null);

    return {
      visits: visits.length,
      totalSpent: visits.reduce((sum, a) => sum + Number(a.priceAtBooking.toString()), 0),
      cancellations: appts.filter((a) => a.status === 'CANCELLED').length,
      noShows: appts.filter((a) => a.status === 'NO_SHOW').length,
      lastVisit: last?.toISOString() ?? null,
      nextAppointment: upcoming
        ? {
            id: upcoming.id,
            startsAt: upcoming.startsAt.toISOString(),
            localDate: utcToLocal(upcoming.startsAt, tz).date,
            localStart: utcToLocal(upcoming.startsAt, tz).time,
          }
        : null,
    };
  }

  private appointmentsOf(customerIds: string[]): Promise<ApptRow[]> {
    if (customerIds.length === 0) return Promise.resolve([]);
    return this.prisma.appointment.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true, customerId: true, status: true, startsAt: true, endsAt: true, priceAtBooking: true },
    });
  }

  private searchFilter(term?: string): Prisma.CustomerWhereInput {
    const q = term?.trim();
    if (!q) return {};
    const digits = q.replace(/\D/g, '');
    return {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    };
  }

  private toResponse(c: { id: string; name: string; phone: string; notes: string | null }): CustomerResponse {
    return { id: c.id, name: c.name, phone: c.phone, notes: c.notes };
  }

  private async timezone(barbershopId: string): Promise<string> {
    const shop = await this.prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true },
    });
    if (!shop) throw new NotFoundException('Barbería no encontrada');
    return shop.timezone;
  }
}
