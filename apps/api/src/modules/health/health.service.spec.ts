import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('HealthService', () => {
  it('devuelve ok cuando la base responde', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as unknown as PrismaService);

    await expect(service.check()).resolves.toMatchObject({ status: 'ok', database: 'up' });
  });

  it('lanza 503 cuando la base no responde', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const service = new HealthService(prisma as unknown as PrismaService);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
