import { Injectable, Logger } from '@nestjs/common';
import { BotService } from './bot/bot.service.js';
import { fromCloudApiMessage, type CloudApiInboundMessage } from './bot/cloud-api.mapper.js';
import { buttons } from './bot/messages.js';
import { IDS } from './bot/bot.types.js';
import { CloudApiClient } from './cloud-api.client.js';
import { WhatsappAccountResolver } from './whatsapp-account.resolver.js';

/** Subconjunto del payload de webhooks de WhatsApp que usamos. */
export interface WebhookPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: CloudApiInboundMessage[];
        statuses?: { id: string; status: string; errors?: { code: number; title: string }[] }[];
      };
    }[];
  }[];
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly accounts: WhatsappAccountResolver,
    private readonly bot: BotService,
    private readonly client: CloudApiClient,
  ) {}

  /** Procesa todos los mensajes de un webhook. Los errores se registran sin cortar el resto. */
  async process(payload: WebhookPayload): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') return;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (change.field !== 'messages' || !value) continue;

        for (const status of value.statuses ?? []) {
          if (status.status === 'failed') {
            this.logger.warn(`Mensaje ${status.id} no entregado: ${JSON.stringify(status.errors ?? [])}`);
          }
        }

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId || !value.messages?.length) continue;

        const account = await this.accounts.resolve(phoneNumberId);
        if (!account) {
          this.logger.warn(`Webhook para un número no configurado (phone_number_id ${phoneNumberId})`);
          continue;
        }

        for (const message of value.messages) {
          try {
            const profileName = value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name;
            await this.client.markAsRead(account, message.id);

            const incoming = fromCloudApiMessage(message);
            if (!incoming) {
              await this.client.sendAll(account, message.from, [
                buttons('Por ahora solo entiendo mensajes de texto y las opciones del menú 🙏', [
                  { id: IDS.menu.HOME, title: 'Ver el menú' },
                ]),
              ]);
              continue;
            }

            const { duplicate, replies } = await this.bot.handleIncoming(account.barbershopId, {
              messageId: message.id,
              phone: message.from,
              profileName,
              message: incoming,
            });
            if (!duplicate) await this.client.sendAll(account, message.from, replies);
          } catch (error) {
            this.logger.error(
              `Error procesando el mensaje ${message.id}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      }
    }
  }
}
