import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AppointmentsService } from './appointments.service.js';
import type { AppointmentResponse } from './appointments.types.js';
import {
  cancelSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  rescheduleSchema,
  statusSchema,
  type CancelInput,
  type CreateAppointmentInput,
  type ListAppointmentsQuery,
  type RescheduleInput,
  type StatusInput,
} from './appointments.schemas.js';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listAppointmentsQuerySchema }) query: ListAppointmentsQuery,
  ): Promise<AppointmentResponse[]> {
    return this.appointments.list(user.barbershopId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentResponse> {
    return this.appointments.findOne(user.barbershopId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createAppointmentSchema }) body: CreateAppointmentInput,
  ): Promise<AppointmentResponse> {
    return this.appointments.create(user.barbershopId, body, {
      canOverrideSchedule: user.role === 'OWNER',
      source: 'ADMIN',
    });
  }

  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: rescheduleSchema }) body: RescheduleInput,
  ): Promise<AppointmentResponse> {
    return this.appointments.reschedule(user.barbershopId, id, body, {
      canOverrideSchedule: user.role === 'OWNER',
    });
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: cancelSchema }) body: CancelInput,
  ): Promise<AppointmentResponse> {
    return this.appointments.cancel(user.barbershopId, id, body);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: statusSchema }) body: StatusInput,
  ): Promise<AppointmentResponse> {
    return this.appointments.setStatus(user.barbershopId, id, body);
  }
}
