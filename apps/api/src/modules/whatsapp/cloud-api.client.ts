import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { toCloudApiPayload } from './bot/cloud-api.mapper.js';
import type { OutgoingMessage } from './bot/messages.js';
import type { WhatsappAccount } from './whatsapp-account.resolver.js';

/** Cliente HTTP mínimo de la WhatsApp Cloud API (Graph API de Meta). */
@Injectable()
export class CloudApiClient {
  private readonly logger = new Logger(CloudApiClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = `https://graph.facebook.com/${config.get('WHATSAPP_GRAPH_VERSION', { infer: true })}`;
  }

  /** Envía las respuestas en orden (WhatsApp no garantiza el orden si se mandan en paralelo). */
  async sendAll(account: WhatsappAccount, to: string, messages: OutgoingMessage[]): Promise<void> {
    for (const message of messages) {
      await this.post(account, toCloudApiPayload(to, message));
    }
  }

  /** Marca el mensaje del cliente como leído y muestra "escribiendo…" mientras se procesa. */
  async markAsRead(account: WhatsappAccount, messageId: string): Promise<void> {
    await this.post(account, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    }).catch(() => undefined); // no es crítico
  }

  /** Descarga un archivo multimedia recibido (ej. nota de voz). Máximo 16 MB. */
  async downloadMedia(account: WhatsappAccount, mediaId: string): Promise<Uint8Array> {
    const auth = { Authorization: `Bearer ${account.accessToken}` };
    const meta = await fetch(`${this.baseUrl}/${mediaId}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
    if (!meta.ok) throw new Error(`No se pudo obtener el audio (${meta.status})`);
    const { url, file_size } = (await meta.json()) as { url: string; file_size?: number };
    if (file_size && file_size > 16 * 1024 * 1024) throw new Error('Archivo demasiado grande');

    const file = await fetch(url, { headers: auth, signal: AbortSignal.timeout(20_000) });
    if (!file.ok) throw new Error(`No se pudo descargar el audio (${file.status})`);
    return new Uint8Array(await file.arrayBuffer());
  }

  private async post(account: WhatsappAccount, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${account.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Cloud API respondió ${res.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Cloud API ${res.status}`);
    }
  }
}
