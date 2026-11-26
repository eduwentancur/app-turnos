import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';
import { toServiceResponse, type ServiceResponse } from './services.types.js';
import type {
  CreateServiceInput,
  ListServicesQuery,
  UpdateServiceInput,
} from './services.schemas.js';

/**
 * Servicios de la barbería. Toda operación se filtra por barbershopId:
 * un usuario nunca ve ni modifica servicios de otra barbería.
 */
@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(barbershopId: string, { includeInactive }: ListServicesQuery): Promise<ServiceResponse[]> {
    const services = await this.prisma.service.findMany({
      where: { barbershopId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return services.map(toServiceResponse);
  }

  async findOne(barbershopId: string, id: string): Promise<ServiceResponse> {
    return toServiceResponse(await this.getOwned(barbershopId, id));
  }

  /** Crea el servicio y lo asigna a todos los barberos activos. */
  async create(barbershopId: string, input: CreateServiceInput): Promise<ServiceResponse> {
    await this.assertNameAvailable(barbershopId, input.name);
    try {
      const service = await this.prisma.$transaction(async (tx) => {
        const created = await tx.service.create({
          data: {
            barbershopId,
            name: input.name,
            description: input.description ?? null,
            durationMinutes: input.durationMinutes,
            price: input.price,
            isActive: input.isActive ?? true,
          },
        });
        const barbers = await tx.barber.findMany({
          where: { barbershopId, isActive: true },
          select: { id: true },
        });
        if (barbers.length) {
          await tx.barberService.createMany({
            data: barbers.map((b) => ({ barberId: b.id, serviceId: created.id })),
          });
        }
        return created;
      });
      return toServiceResponse(service);
    } catch (error) {
      throw this.translate(error, input.name);
    }
  }

  async update(barbershopId: string, id: string, input: UpdateServiceInput): Promise<ServiceResponse> {
    await this.getOwned(barbershopId, id);
    if (input.name !== undefined) await this.assertNameAvailable(barbershopId, input.name, id);
    try {
      const service = await this.prisma.service.update({
        where: { id },
        data: input,
      });
      return toServiceResponse(service);
    } catch (error) {
      throw this.translate(error, input.name);
    }
  }

  /**
   * Elimina el servicio solo si nunca se usó. Si tiene turnos, hay que desactivarlo:
   * así se conserva el historial y las estadísticas.
   */
  async remove(barbershopId: string, id: string): Promise<void> {
    await this.getOwned(barbershopId, id);
    const appointments = await this.prisma.appointment.count({ where: { serviceId: id } });
    if (appointments > 0) {
      throw new ConflictException(
        'El servicio tiene turnos registrados: desactivalo en lugar de eliminarlo',
      );
    }
    await this.prisma.service.delete({ where: { id } });
  }

  private async getOwned(barbershopId: string, id: string) {
    const service = await this.prisma.service.findFirst({ where: { id, barbershopId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  /** "Corte" y "corte" se consideran el mismo servicio. */
  private async assertNameAvailable(barbershopId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.service.findFirst({
      where: {
        barbershopId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (clash) throw new ConflictException(`Ya existe un servicio llamado "${clash.name}"`);
  }

  private translate(error: unknown, name?: string): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(`Ya existe un servicio llamado "${name}"`);
    }
    return error;
  }
}
