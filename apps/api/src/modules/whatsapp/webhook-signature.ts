import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifica la cabecera X-Hub-Signature-256 que Meta agrega a cada webhook:
 * HMAC-SHA256 del cuerpo crudo con la clave secreta de la app.
 * Sin esto, cualquiera podría enviar mensajes falsos al endpoint.
 */
export function isValidSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function sign(rawBody: Buffer | string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}
