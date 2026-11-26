import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AvailabilityService } from './availability.service.js';
import type { DayAvailabilityResponse, DaysAvailabilityResponse } from './availability.types.js';
import {
  dayAvailabilityQuerySchema,
  daysAvailabilityQuerySchema,
  type DayAvailabilityQuery,
  type DaysAvailabilityQuery,
} from './availability.schemas.js';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /** Horarios libres de un día, agrupados por franja. */
  @Get()
  getDay(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dayAvailabilityQuerySchema }) query: DayAvailabilityQuery,
  ): Promise<DayAvailabilityResponse> {
    return this.availability.getDay(user.barbershopId, query);
  }

  /** Resumen de los próximos días: cuántos horarios libres tiene cada uno. */
  @Get('days')
  getDays(
    @CurrentUser() user: AuthUser,
    @Query({ schema: daysAvailabilityQuerySchema }) query: DaysAvailabilityQuery,
  ): Promise<DaysAvailabilityResponse> {
    return this.availability.getDays(user.barbershopId, query);
  }
}
