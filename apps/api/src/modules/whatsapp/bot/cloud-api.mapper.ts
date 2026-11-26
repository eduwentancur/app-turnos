import type { IncomingMessage, OutgoingMessage } from './messages.js';

/**
 * Traducción entre el modelo interno y el formato de la WhatsApp Cloud API de Meta.
 * Se usa al enviar (POST /{phone-number-id}/messages) y al recibir webhooks.
 */

export function toCloudApiPayload(to: string, message: OutgoingMessage): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: to.replace(/^\+/, '') };
  switch (message.type) {
    case 'text':
      return { ...base, type: 'text', text: { body: message.text, preview_url: true } };
    case 'buttons':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            buttons: message.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
          },
        },
      };
    case 'list':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: { button: message.button, sections: message.sections },
        },
      };
  }
}

/** Mensaje entrante tal como llega dentro de un webhook de Meta (subset que usamos). */
export interface CloudApiInboundMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
}

/**
 * Convierte un mensaje del webhook al modelo interno.
 * Devuelve null para tipos que el bot no maneja (audio, imagen, ubicación...).
 */
export function fromCloudApiMessage(msg: CloudApiInboundMessage): IncomingMessage | null {
  if (msg.type === 'text' && msg.text) return { type: 'text', text: msg.text.body };
  if (msg.type === 'interactive' && msg.interactive) {
    const reply = msg.interactive.button_reply ?? msg.interactive.list_reply;
    return reply ? { type: 'reply', id: reply.id, title: reply.title } : null;
  }
  // Botones de plantillas (ej. recordatorios con "Confirmo asistencia")
  if (msg.type === 'button' && msg.button) return { type: 'reply', id: msg.button.payload, title: msg.button.text };
  return null;
}
