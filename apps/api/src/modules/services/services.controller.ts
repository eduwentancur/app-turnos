import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ServicesService } from './services.service.js';
import type { ServiceResponse } from './services.types.js';
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
  type CreateServiceInput,
  type ListServicesQuery,
  type UpdateServiceInput,
} from './services.schemas.js';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listServicesQuerySchema }) query: ListServicesQuery,
  ): Promise<ServiceResponse[]> {
    return this.services.list(user.barbershopId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ServiceResponse> {
    return this.services.findOne(user.barbershopId, id);
  }

  @Roles('OWNER')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createServiceSchema }) body: CreateServiceInput,
  ): Promise<ServiceResponse> {
    return this.services.create(user.barbershopId, body);
  }

  @Roles('OWNER')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateServiceSchema }) body: UpdateServiceInput,
  ): Promise<ServiceResponse> {
    return this.services.update(user.barbershopId, id, body);
  }

  @Roles('OWNER')
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.services.remove(user.barbershopId, id);
  }
}
