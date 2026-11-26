import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { PasswordService } from '../../src/modules/auth/password.service.js';
import type { UserRole } from '../../src/generated/prisma/enums.js';

export interface TestTenant {
  barbershopId: string;
  barberId: string;
  /** Crea un usuario en la barbería y devuelve su access token. */
  tokenFor: (role: UserRole) => Promise<string>;
  cleanup: () => Promise<void>;
}

/** Barbería aislada con un barbero, para tests e2e. Se limpia sola al final. */
export async function createTenant(app: NestExpressApplication): Promise<TestTenant> {
  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService);
  const suffix = randomUUID().slice(0, 8);
  const password = 'ClaveSegura123';

  const shop = await prisma.barbershop.create({
    data: { name: `E2E ${suffix}`, slug: `e2e-${suffix}` },
  });
  const barber = await prisma.barber.create({
    data: { barbershopId: shop.id, name: 'Barbero E2E' },
  });
  const hash = await passwords.hash(password);

  return {
    barbershopId: shop.id,
    barberId: barber.id,
    async tokenFor(role) {
      const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`;
      await prisma.user.create({
        data: { barbershopId: shop.id, email, name: role, role, passwordHash: hash },
      });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return res.body.accessToken as string;
    },
    async cleanup() {
      const where = { barbershopId: shop.id };
      await prisma.appointment.deleteMany({ where });
      await prisma.customer.deleteMany({ where });
      await prisma.service.deleteMany({ where });
      await prisma.barber.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.barbershop.delete({ where: { id: shop.id } });
    },
  };
}
