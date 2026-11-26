import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { ServicesModule } from '../services/services.module.js';
import { BookingFlow } from './bot/booking.flow.js';
import { BotService } from './bot/bot.service.js';
import { ManageFlow } from './bot/manage.flow.js';
import { SimulatorController } from './simulator.controller.js';

@Module({
  imports: [AppointmentsModule, AvailabilityModule, CustomersModule, ScheduleModule, ServicesModule],
  controllers: [SimulatorController],
  providers: [BotService, BookingFlow, ManageFlow],
  exports: [BotService],
})
export class WhatsappModule {}
