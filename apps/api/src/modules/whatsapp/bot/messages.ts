/**
 * Modelo de mensajes independiente del canal. El bot produce estos objetos y
 * cada transporte (simulador, WhatsApp Cloud API) los traduce a su formato.
 * Los constructores aplican los límites de WhatsApp para que nunca se envíe
 * un mensaje que Meta rechace o recorte.
 */

export const LIMITS = {
  body: 1024,
  textMessage: 4096,
  buttonTitle: 20,
  buttonsPerMessage: 3,
  listButton: 20,
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
  rowsPerList: 10,
  replyId: 200,
  header: 60,
  footer: 60,
} as const;

export interface TextMessage {
  type: 'text';
  text: string;
}

export interface ButtonsMessage {
  type: 'buttons';
  body: string;
  buttons: { id: string; title: string }[];
  footer?: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListMessage {
  type: 'list';
  body: string;
  button: string;
  sections: { title?: string; rows: ListRow[] }[];
  footer?: string;
}

export type OutgoingMessage = TextMessage | ButtonsMessage | ListMessage;

/** Lo que manda el cliente: texto libre o la respuesta a un botón / lista. */
export type IncomingMessage =
  | { type: 'text'; text: string; /** Texto obtenido al transcribir un audio */ fromAudio?: boolean }
  | { type: 'reply'; id: string; title?: string };

export const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export function text(body: string): TextMessage {
  return { type: 'text', text: truncate(body, LIMITS.textMessage) };
}

export function buttons(body: string, items: { id: string; title: string }[], footer?: string): ButtonsMessage {
  if (items.length === 0 || items.length > LIMITS.buttonsPerMessage) {
    throw new Error(`Un mensaje admite de 1 a ${LIMITS.buttonsPerMessage} botones`);
  }
  return {
    type: 'buttons',
    body: truncate(body, LIMITS.body),
    buttons: items.map((b) => ({ id: b.id.slice(0, LIMITS.replyId), title: truncate(b.title, LIMITS.buttonTitle) })),
    ...(footer ? { footer: truncate(footer, LIMITS.footer) } : {}),
  };
}

export function list(
  body: string,
  button: string,
  sections: { title?: string; rows: ListRow[] }[],
  footer?: string,
): ListMessage {
  const rows = sections.reduce((n, s) => n + s.rows.length, 0);
  if (rows === 0 || rows > LIMITS.rowsPerList) {
    throw new Error(`Una lista admite de 1 a ${LIMITS.rowsPerList} filas en total`);
  }
  return {
    type: 'list',
    body: truncate(body, LIMITS.body),
    button: truncate(button, LIMITS.listButton),
    sections: sections
      .filter((s) => s.rows.length > 0)
      .map((s) => ({
        ...(s.title ? { title: truncate(s.title, LIMITS.sectionTitle) } : {}),
        rows: s.rows.map((r) => ({
          id: r.id.slice(0, LIMITS.replyId),
          title: truncate(r.title, LIMITS.rowTitle),
          ...(r.description ? { description: truncate(r.description, LIMITS.rowDescription) } : {}),
        })),
      })),
    ...(footer ? { footer: truncate(footer, LIMITS.footer) } : {}),
  };
}
