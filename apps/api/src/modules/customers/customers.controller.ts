import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  CustomersService,
  type CustomerDetail,
  type CustomerPage,
  type CustomerResponse,
} from './customers.service.js';
import {
  listCustomersQuerySchema,
  updateCustomerSchema,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from './customers.schemas.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listCustomersQuerySchema }) query: ListCustomersQuery,
  ): Promise<CustomerPage> {
    return this.customers.list(user.barbershopId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CustomerDetail> {
    return this.customers.findOne(user.barbershopId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateCustomerSchema }) body: UpdateCustomerInput,
  ): Promise<CustomerResponse> {
    return this.customers.update(user.barbershopId, id, body);
  }
}
