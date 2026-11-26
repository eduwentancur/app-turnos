import type { IncomingMessage, OutgoingMessage } from './messages.js';

export type BotState =
  | 'IDLE'
  | 'ASK_NAME'
  | 'PICK_SERVICE'
  | 'PICK_BARBER'
  | 'PICK_DAY'
  | 'PICK_SLOT'
  | 'CONFIRM'
  | 'PICK_APPOINTMENT'
  | 'CONFIRM_CANCEL';

export interface BotContext {
  /** book = reserva nueva · reschedule = cambiar un turno · cancel = cancelar uno */
  mode?: 'book' | 'reschedule' | 'cancel';
  customerName?: string;
  serviceId?: string;
  /** null = cualquier barbero */
  barberId?: string | null;
  date?: string;
  page?: number;
  slotStart?: string;
  /** Hora local del horario elegido ("16:30") */
  slotTime?: string;
  slotBarberId?: string;
  appointmentId?: string;
}

/** Todo lo que el bot sabe en cada mensaje. */
export interface Turn {
  barbershopId: string;
  phone: string;
  profileName?: string;
  customer: { id: string; name: string } | null;
  state: BotState;
  ctx: BotContext;
}

export interface FlowResult {
  state: BotState;
  ctx: BotContext;
  replies: OutgoingMessage[];
}

export interface InboundEnvelope {
  /** ID único del mensaje (wamid de WhatsApp) para descartar duplicados */
  messageId: string;
  phone: string;
  profileName?: string;
  message: IncomingMessage;
}

/** IDs de respuesta de botones y listas. */
export const IDS = {
  menu: {
    BOOK: 'MENU:BOOK',
    MINE: 'MENU:MINE',
    RESCHEDULE: 'MENU:RESCHEDULE',
    CANCEL: 'MENU:CANCEL',
    SERVICES: 'MENU:SERVICES',
    INFO: 'MENU:INFO',
    HOME: 'MENU:HOME',
  },
  useProfileName: 'NAME:PROFILE',
  anyBarber: 'BRB:ANY',
  confirm: 'CONFIRM',
  changeSlot: 'CHANGE_SLOT',
  abort: 'ABORT',
  cancelYes: 'CANCEL_YES',
  cancelNo: 'CANCEL_NO',
} as const;

export const prefixed = (prefix: 'SVC' | 'BRB' | 'DAY' | 'SLOT' | 'MORE' | 'APPT', value: string | number) =>
  `${prefix}:${value}`;

export function parseReply(id: string): { prefix: string; value: string } {
  const i = id.indexOf(':');
  return i === -1 ? { prefix: id, value: '' } : { prefix: id.slice(0, i), value: id.slice(i + 1) };
}
