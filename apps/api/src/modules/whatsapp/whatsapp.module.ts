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
import { CloudApiClient } from './cloud-api.client.js';
import { WebhookController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';
import { WhatsappAccountResolver } from './whatsapp-account.resolver.js';
import { LocalWhisperTranscriber, TRANSCRIBER } from './audio/transcriber.js';

@Module({
  imports: [AppointmentsModule, AvailabilityModule, CustomersModule, ScheduleModule, ServicesModule],
  controllers: [SimulatorController, WebhookController],
  providers: [
    BotService,
    BookingFlow,
    ManageFlow,
    CloudApiClient,
    WebhookService,
    WhatsappAccountResolver,
    LocalWhisperTranscriber,
    { provide: TRANSCRIBER, useExisting: LocalWhisperTranscriber },
  ],
  exports: [BotService],
})
export class WhatsappModule {}
