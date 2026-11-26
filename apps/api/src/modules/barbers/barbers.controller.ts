import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface BarberResponse {
  id: string;
  name: string;
  isActive: boolean;
}

/** Lectura de barberos (la gestión completa llega con la sección Barberos). */
@Controller('barbers')
export class BarbersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<BarberResponse[]> {
    return this.prisma.barber.findMany({
      where: { barbershopId: user.barbershopId },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
