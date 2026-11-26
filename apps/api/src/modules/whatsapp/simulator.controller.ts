import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { BotService } from './bot/bot.service.js';
import type { OutgoingMessage } from './bot/messages.js';
import { AudioTooLongError, TRANSCRIBER, type Transcriber } from './audio/transcriber.js';

const messageSchema = z.object({
  phone: z.string().trim().min(8).max(25),
  profileName: z.string().trim().max(60).optional(),
  /** Opcional: para probar mensajes duplicados se puede repetir el mismo id */
  messageId: z.string().trim().min(1).max(100).optional(),
  message: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().min(1).max(1000), fromAudio: z.boolean().optional() }),
    z.object({ type: z.literal('reply'), id: z.string().min(1).max(200), title: z.string().max(100).optional() }),
  ]),
});
type MessageInput = z.infer<typeof messageSchema>;

const resetSchema = z.object({ phone: z.string().trim().min(8).max(25) });

const audioSchema = z.object({
  phone: z.string().trim().min(8).max(25),
  profileName: z.string().trim().max(60).optional(),
  /** Audio grabado en el navegador: PCM 16 bits, mono, 16 kHz, en base64 */
  pcm16: z.string().min(100).max(4_000_000),
});
type AudioInput = z.infer<typeof audioSchema>;

/**
 * Simulador del bot: misma lógica que el webhook de WhatsApp, pero las respuestas
 * vuelven en la respuesta HTTP en lugar de enviarse a Meta. Los turnos que se
 * reservan son reales (origen WHATSAPP).
 */
@Controller('whatsapp/simulator')
export class SimulatorController {
  constructor(
    private readonly bot: BotService,
    @Inject(TRANSCRIBER) private readonly transcriber: Transcriber,
  ) {}

  /** Nota de voz grabada desde el simulador: se transcribe y se procesa como en WhatsApp. */
  @Post('audio')
  @HttpCode(200)
  async audio(
    @CurrentUser() user: AuthUser,
    @Body({ schema: audioSchema }) body: AudioInput,
  ): Promise<{ duplicate: boolean; transcript: string; replies: OutgoingMessage[] }> {
    if (!this.transcriber.enabled) throw new ServiceUnavailableException('La transcripción de audios está desactivada');
    const bytes = Buffer.from(body.pcm16, 'base64');
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
    const samples = Float32Array.from(int16, (v) => v / 32768);

    let transcript: string;
    try {
      transcript = (await this.transcriber.transcribePcm(samples)).text;
    } catch (error) {
      if (error instanceof AudioTooLongError) throw new BadRequestException(`El audio supera los ${error.max} segundos`);
      throw error;
    }
    if (!transcript) return { duplicate: false, transcript, replies: [{ type: 'text', text: 'No pude escuchar bien el audio 🙉 ¿Probás de nuevo?' }] };

    const result = await this.bot.handleIncoming(user.barbershopId, {
      messageId: `sim-${randomUUID()}`,
      phone: body.phone,
      profileName: body.profileName,
      message: { type: 'text', text: transcript, fromAudio: true },
    });
    return { ...result, transcript };
  }

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
