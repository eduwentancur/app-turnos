import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ScheduleService } from './schedule.service.js';
import type { TimeOffResponse, WeekResponse } from './schedule.types.js';
import {
  createTimeOffSchema,
  listTimeOffsQuerySchema,
  replaceWeekSchema,
  weekQuerySchema,
  type CreateTimeOffInput,
  type ListTimeOffsQuery,
  type ReplaceWeekInput,
  type WeekQuery,
} from './schedule.schemas.js';

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('working-hours')
  getWeek(
    @CurrentUser() user: AuthUser,
    @Query({ schema: weekQuerySchema }) query: WeekQuery,
  ): Promise<WeekResponse> {
    return this.schedule.getWeek(user.barbershopId, query.barberId ?? null);
  }

  @Roles('OWNER')
  @Put('working-hours')
  replaceWeek(
    @CurrentUser() user: AuthUser,
    @Body({ schema: replaceWeekSchema }) body: ReplaceWeekInput,
  ): Promise<WeekResponse> {
    return this.schedule.replaceWeek(user.barbershopId, body);
  }

  @Get('time-offs')
  listTimeOffs(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTimeOffsQuerySchema }) query: ListTimeOffsQuery,
  ): Promise<TimeOffResponse[]> {
    return this.schedule.listTimeOffs(user.barbershopId, query);
  }

  @Roles('OWNER')
  @Post('time-offs')
  createTimeOff(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTimeOffSchema }) body: CreateTimeOffInput,
  ): Promise<TimeOffResponse> {
    return this.schedule.createTimeOff(user.barbershopId, body);
  }

  @Roles('OWNER')
  @Delete('time-offs/:id')
  @HttpCode(204)
  removeTimeOff(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.schedule.removeTimeOff(user.barbershopId, id);
  }
}
