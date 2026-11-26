import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
  latencyMs: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'La base de datos no responde',
      });
    }
    return {
      status: 'ok',
      database: 'up',
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}
