import { Body, Controller, Delete, HttpCode, Post, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { BotService } from './bot/bot.service.js';
import type { OutgoingMessage } from './bot/messages.js';

const messageSchema = z.object({
  phone: z.string().trim().min(8).max(25),
  profileName: z.string().trim().max(60).optional(),
  /** Opcional: para probar mensajes duplicados se puede repetir el mismo id */
  messageId: z.string().trim().min(1).max(100).optional(),
  message: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().min(1).max(1000) }),
    z.object({ type: z.literal('reply'), id: z.string().min(1).max(200), title: z.string().max(100).optional() }),
  ]),
});
type MessageInput = z.infer<typeof messageSchema>;

const resetSchema = z.object({ phone: z.string().trim().min(8).max(25) });

/**
 * Simulador del bot: misma lógica que el webhook de WhatsApp, pero las respuestas
 * vuelven en la respuesta HTTP en lugar de enviarse a Meta. Los turnos que se
 * reservan son reales (origen WHATSAPP).
 */
@Controller('whatsapp/simulator')
export class SimulatorController {
  constructor(private readonly bot: BotService) {}

  @Post('messages')
  @HttpCode(200)
  async send(
    @CurrentUser() user: AuthUser,
    @Body({ schema: messageSchema }) body: MessageInput,
  ): Promise<{ duplicate: boolean; replies: OutgoingMessage[] }> {
    return this.bot.handleIncoming(user.barbershopId, {
      messageId: body.messageId ?? `sim-${randomUUID()}`,
      phone: body.phone,
      profileName: body.profileName,
      message: body.message,
    });
  }

  @Delete('conversation')
  @HttpCode(204)
  async reset(
    @CurrentUser() user: AuthUser,
    @Query({ schema: resetSchema }) query: z.infer<typeof resetSchema>,
  ): Promise<void> {
    await this.bot.reset(user.barbershopId, query.phone);
  }
}
