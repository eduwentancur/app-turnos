import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import type { Env } from '../../config/env.validation.js';
import { isValidSignature } from './webhook-signature.js';
import { WebhookService, type WebhookPayload } from './webhook.service.js';

/**
 * Webhook de la WhatsApp Cloud API.
 * - GET: Meta verifica la URL una vez al configurarla (hub.challenge).
 * - POST: cada mensaje entrante. Se responde 200 enseguida y se procesa en segundo plano,
 *   porque Meta reintenta si la respuesta tarda.
 */
@Public()
@SkipThrottle()
@Controller('whatsapp/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhook: WebhookService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = this.config.get('WHATSAPP_VERIFY_TOKEN', { infer: true });
    if (!expected) throw new ServiceUnavailableException('WhatsApp no está configurado (falta WHATSAPP_VERIFY_TOKEN)');
    if (mode !== 'subscribe' || token !== expected) throw new ForbiddenException('Token de verificación inválido');
    this.logger.log('Webhook de WhatsApp verificado por Meta');
    return challenge;
  }

  @Post()
  @HttpCode(200)
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): { received: true } {
    const secret = this.config.get('WHATSAPP_APP_SECRET', { infer: true });
    if (!secret) throw new ServiceUnavailableException('WhatsApp no está configurado (falta WHATSAPP_APP_SECRET)');
    if (!req.rawBody || !isValidSignature(req.rawBody, signature, secret)) {
      this.logger.warn('Webhook rechazado: firma inválida');
      throw new ForbiddenException('Firma inválida');
    }

    const payload = req.body as WebhookPayload;
    void this.webhook.process(payload).catch((error: unknown) => {
      this.logger.error('Error procesando webhook', error instanceof Error ? error.stack : String(error));
    });
    return { received: true };
  }
}
