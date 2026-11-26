import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Env } from '../../config/env.validation.js';

export interface WhatsappAccount {
  barbershopId: string;
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Resuelve a qué barbería pertenece un número de WhatsApp Business (phone_number_id)
 * y con qué token se le responde.
 *
 * Implementación actual: un número configurado por variables de entorno (barbería piloto).
 * Cuando se sumen barberías con Embedded Signup, esta clase pasa a leer de una tabla
 * sin que el webhook ni el bot cambien.
 */
@Injectable()
export class WhatsappAccountResolver {
  private readonly logger = new Logger(WhatsappAccountResolver.name);
  private cachedBarbershopId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true }) &&
        this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true }) &&
        this.config.get('WHATSAPP_BARBERSHOP_SLUG', { infer: true }),
    );
  }

  async resolve(phoneNumberId: string): Promise<WhatsappAccount | null> {
    const configuredId = this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true });
    const accessToken = this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true });
    const slug = this.config.get('WHATSAPP_BARBERSHOP_SLUG', { infer: true });
    if (!configuredId || !accessToken || !slug || phoneNumberId !== configuredId) return null;

    if (!this.cachedBarbershopId) {
      const shop = await this.prisma.barbershop.findUnique({ where: { slug }, select: { id: true } });
      if (!shop) {
        this.logger.error(`WHATSAPP_BARBERSHOP_SLUG="${slug}" no corresponde a ninguna barbería`);
        return null;
      }
      this.cachedBarbershopId = shop.id;
    }
    return { barbershopId: this.cachedBarbershopId, phoneNumberId, accessToken };
  }
}
