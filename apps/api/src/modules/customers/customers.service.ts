import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizePhone } from '../../common/phone.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface CustomerResponse {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async search(barbershopId: string, term?: string): Promise<CustomerResponse[]> {
    const q = term?.trim();
    const digits = q?.replace(/\D/g, '');
    return this.prisma.customer.findMany({
      where: {
        barbershopId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : {}),
      },
      select: { id: true, name: true, phone: true, notes: true },
      orderBy: { name: 'asc' },
      take: 20,
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
}
