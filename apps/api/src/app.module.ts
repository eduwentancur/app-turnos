import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { ScheduleModule } from './modules/schedule/schedule.module.js';
import { AvailabilityModule } from './modules/availability/availability.module.js';
import { BarbersModule } from './modules/barbers/barbers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    // Límite general: 100 requests/minuto por IP (los endpoints sensibles definen el suyo)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    ServicesModule,
    ScheduleModule,
    AvailabilityModule,
    BarbersModule,
  ],
  providers: [
    // useExisting permite reemplazar el guard en tests (overrideProvider)
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
