import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CustomersService, type CustomerResponse } from './customers.service.js';

const searchSchema = z.object({ search: z.string().max(60).optional() });

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  search(
    @CurrentUser() user: AuthUser,
    @Query({ schema: searchSchema }) query: z.infer<typeof searchSchema>,
  ): Promise<CustomerResponse[]> {
    return this.customers.search(user.barbershopId, query.search);
  }
}
