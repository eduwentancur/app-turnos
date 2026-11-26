/**
 * Normaliza un teléfono a E.164 (+ y solo dígitos), con reglas para Argentina,
 * que es el país de la barbería piloto:
 *  - "3764 123456" / "03764 123456"  -> +5493764123456 (celular con código de área)
 *  - "54 3764 123456"                 -> +5493764123456 (se agrega el 9 de celular)
 *  - "5493764123456" (formato WhatsApp) se respeta tal cual
 * Otros países: se toman los dígitos tal como vienen (8 a 15).
 * Devuelve null si no parece un número válido.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') || digits.startsWith('00')) {
    digits = digits.replace(/^00/, '');
  } else {
    digits = digits.replace(/^0/, '');
    // Número local argentino: código de área + número = 10 dígitos
    if (digits.length === 10) digits = `549${digits}`;
  }
  // Argentina sin el 9 de celular
  if (digits.startsWith('54') && !digits.startsWith('549') && digits.length === 12) {
    digits = `549${digits.slice(2)}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
