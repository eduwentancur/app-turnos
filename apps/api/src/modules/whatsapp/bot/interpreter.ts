/**
 * Intérprete por reglas de pedidos escritos o dictados en español rioplatense.
 * Ej: "quiero un corte para mañana tipo 5 de la tarde" →
 *     { intent: 'book', serviceId: <corte>, date: <mañana>, time: '17:00' }
 *
 * Es una función pura (sin base de datos): recibe los servicios y la fecha de hoy.
 * Nunca reserva por sí sola: lo que entiende se usa para saltear pasos y siempre
 * se termina en un resumen con botón de confirmar.
 */

export type Intent = 'book' | 'mine' | 'reschedule' | 'cancel' | 'services' | 'info' | 'greeting';
export type DayPeriod = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface Interpretation {
  intent?: Intent;
  serviceId?: string;
  /** "YYYY-MM-DD" */
  date?: string;
  /** "HH:mm" */
  time?: string;
  /** Franja si dijo "a la tarde" sin hora */
  period?: DayPeriod;
  /** Cantidad de personas si dijo "para mí y mi hijo", "somos 3", "dos cortes" */
  partySize?: number;
}

export interface InterpreterContext {
  /** Hoy en la zona horaria de la barbería, "YYYY-MM-DD" */
  today: string;
  services: { id: string; name: string }[];
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const NUMBER_WORDS: Record<string, number> = {
  una: 1, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  treinta: 30, cuarenta: 40, cuarentaicinco: 45,
};

// Palabras que no ayudan a identificar un servicio
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'un', 'una', 'mas', 'a', 'al', 'en']);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!¿?,;"«»()]/g, ' ')
    // El punto solo se conserva entre números ("18.30")
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\+/g, ' y ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reemplaza números escritos con letras ("cinco y media" → "5 y media"). */
function wordsToDigits(text: string): string {
  return text
    .split(' ')
    .map((w) => (w in NUMBER_WORDS ? String(NUMBER_WORDS[w]) : w))
    .join(' ');
}

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function detectIntent(t: string): Intent | undefined {
  if (/\b(cancel\w*|anul\w*|no (voy a poder|puedo ir|voy a ir))\b/.test(t)) return 'cancel';
  if (/\b(cambi\w*|mover|pasar|reprogram\w*|postergar|adelantar)\b/.test(t) && /\bturno\b|\bhorario\b|\bdia\b/.test(t)) {
    return 'reschedule';
  }
  if (/\b(mis turnos|mi turno|que turno tengo|tengo turno|cuando tengo)\b/.test(t)) return 'mine';
  if (/\b(precio|precios|cuanto (sale|cuesta|esta|cobran)|servicios|que hacen)\b/.test(t)) return 'services';
  if (/\b(donde|direccion|ubicacion|ubicados|como llego|horario de atencion|horarios de atencion|a que hora abren|hasta que hora)\b/.test(t)) {
    return 'info';
  }
  if (/\b(turno|reserv\w*|agend\w*|sacar|quiero|queria|necesito|me podes|me haces|hay lugar|tenes lugar|disponible)\b/.test(t)) {
    return 'book';
  }
  if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(t)) return 'greeting';
  return undefined;
}

function detectService(t: string, services: InterpreterContext['services']): string | undefined {
  const words = t.split(' ');
  // Acepta plurales: "cortes", "barbas"
  const has = (w: string) => words.some((x) => x === w || x === `${w}s` || x === `${w}es`);

  const scored = services
    .map((s) => {
      const tokens = normalize(s.name).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w));
      const matched = tokens.filter(has).length;
      return { id: s.id, score: tokens.length ? matched / tokens.length : 0, length: tokens.length };
    })
    .filter((s) => s.score > 0)
    // Mejor puntaje primero; a igual puntaje, el más específico (más palabras)
    .sort((a, b) => b.score - a.score || b.length - a.length);

  const [best, second] = scored;
  if (!best) return undefined;
  if (best.score === 1) return best.id;
  // Coincidencia parcial ("corte" para "Corte de cabello"): solo si no es ambigua
  if (best.score >= 0.5 && !(second && second.score === best.score)) return best.id;
  return undefined;
}

function detectDate(t: string, today: string): string | undefined {
  // "a la mañana" es una franja, no el día siguiente
  const d = t.replace(/\b(de|por|a) la manana\b/g, ' ');
  if (/\bpasado manana\b/.test(d)) return addDays(today, 2);
  if (/\bmanana\b/.test(d)) return addDays(today, 1);
  if (/\bhoy\b/.test(d)) return today;

  // "28/11", "28-11", "28/11/2026"
  const numeric = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) return resolveDayMonth(Number(numeric[1]), Number(numeric[2]), today, numeric[3]);

  // "28 de noviembre"
  const named = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  if (named) return resolveDayMonth(Number(named[1]), MONTHS[named[2]], today);

  // "el viernes", "este sabado", "el lunes que viene"
  const wd = t.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    let diff = (target - weekdayOf(today) + 7) % 7;
    if (/\b(que viene|proximo|siguiente)\b/.test(t) && diff === 0) diff = 7;
    return addDays(today, diff);
  }

  // "el 28" (día del mes)
  const dayOnly = t.match(/\b(?:el|para el|dia) (\d{1,2})\b(?! ?(?:hs|horas|h\b|:|y media|y cuarto))/);
  if (dayOnly) {
    // Día del mes: si ya pasó en este mes, es el del mes siguiente
    const [y, m] = today.split('-').map(Number);
    const day = Number(dayOnly[1]);
    const thisMonth = resolveDayMonth(day, m, today, String(y));
    if (thisMonth && thisMonth >= today) return thisMonth;
    return m === 12 ? resolveDayMonth(day, 1, today, String(y + 1)) : resolveDayMonth(day, m + 1, today, String(y));
  }
  return undefined;
}

function resolveDayMonth(day: number, month: number, today: string, yearText?: string): string | undefined {
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  const [ty] = today.split('-').map(Number);
  let year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : ty;
  let candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (!yearText && candidate < today) {
    year += 1;
    candidate = `${year}-${pad(month)}-${pad(day)}`;
  }
  // Fecha inexistente (ej. 31/11)
  const check = new Date(`${candidate}T00:00:00Z`);
  return check.getUTCDate() === day ? candidate : undefined;
}

function detectPeriod(t: string): DayPeriod | undefined {
  if (/\b(a la|por la|de la) noche\b/.test(t)) return 'EVENING';
  if (/\b(a la|por la|de la) tarde\b|\bmediodia\b/.test(t)) return 'AFTERNOON';
  // "a la mañana" / "de la mañana" (no confundir con "mañana" = día siguiente)
  if (/\b(a la|por la|de la) manana\b/.test(t)) return 'MORNING';
  return undefined;
}

function detectTime(t: string, period?: DayPeriod): string | undefined {
  if (/\bmediodia\b/.test(t) && !/\b(a las|las|tipo) \d/.test(t)) return '12:00';

  const minutesFrom = (suffix?: string, digits?: string): { add: number; minute: number } => {
    if (digits) return { add: 0, minute: Number(digits) };
    if (suffix === 'y media') return { add: 0, minute: 30 };
    if (suffix === 'y cuarto') return { add: 0, minute: 15 };
    if (suffix === 'menos cuarto') return { add: -1, minute: 45 };
    return { add: 0, minute: 0 };
  };

  let hour: number | undefined;
  let minute = 0;
  const patterns: RegExp[] = [
    // 17:30 · 17.30
    /\b(\d{1,2})[:.](\d{2})\b/,
    // a las 5 · tipo 6 y media · para las 17 y 30 · a la 1
    /\b(?:a las|las|tipo|tipo a las|para las|eso de las|por las|a la)\s(\d{1,2})(?:\s(y media|y cuarto|menos cuarto)|\sy\s(\d{2}))?\b/,
    // 17hs · 17 horas · 5h
    /\b(\d{1,2})\s?(?:hs|horas|h)\b/,
    // 5 y media · 5 de la tarde
    /\b(\d{1,2})\s(y media|y cuarto|menos cuarto)\b/,
    /\b(\d{1,2})\sde la (?:tarde|manana|noche)\b/,
  ];
  for (const [index, re] of patterns.entries()) {
    const m = t.match(re);
    if (!m) continue;
    hour = Number(m[1]);
    if (index === 0) minute = Number(m[2]);
    else if (index === 1 || index === 3) {
      const extra = minutesFrom(m[2], index === 1 ? m[3] : undefined);
      hour += extra.add;
      minute = extra.minute;
    }
    break;
  }
  if (hour === undefined || hour < 0 || hour > 23 || minute > 59) return undefined;

  // Horas de 1 a 8 sin aclaración: en una barbería casi siempre es de tarde
  if (hour < 12 && (period === 'AFTERNOON' || period === 'EVENING')) hour += 12;
  else if (hour >= 1 && hour <= 8 && period !== 'MORNING') hour += 12;
  return `${pad(hour)}:${pad(minute)}`;
}

const COMPANIONS = 'hijo|hija|hijos|papa|viejo|vieja|mama|hermano|hermana|amigo|amiga|novio|novia|pareja|esposo|esposa|marido|mujer|sobrino|sobrina|primo|prima|nene|nena|abuelo|tio|cunado|companero';

function detectPartySize(t: string): number | undefined {
  const explicit = t.match(/\b(?:somos|para|seriamos|vamos) (\d)\b(?! ?(?:hs|horas|h\b|:|y media|y cuarto))|\b(\d) (?:cortes|turnos|personas|barbas)\b/);
  if (explicit) {
    const n = Number(explicit[1] ?? explicit[2]);
    if (n >= 1 && n <= 5) return n;
  }
  const mentions = t.match(new RegExp(`\\bmis? (?:${COMPANIONS})\\b`, 'g'))?.length ?? 0;
  // "para mí y mi hijo", "mi hijo y yo", "a mí y a mi papá"
  // "para mí" cuenta solo si no sigue un acompañante ("para mi hijo" = una sola persona)
  const self = new RegExp(`\\b(?:para|a) mi\\b(?! (?:${COMPANIONS})\\b)|\\byo\\b|\\bme (?:lo )?corto\\b|\\by otro para\\b`);
  if (mentions > 0 && self.test(t)) return 1 + mentions;
  if (/\bmis hijos\b/.test(t)) return 3;
  return undefined;
}

export function interpret(text: string, ctx: InterpreterContext): Interpretation {
  const t = wordsToDigits(normalize(text));
  const result: Interpretation = {};

  const intent = detectIntent(t);
  const serviceId = detectService(t, ctx.services);
  const date = detectDate(t, ctx.today);
  const period = detectPeriod(t);
  const time = detectTime(t, period);

  const partySize = detectPartySize(t);
  if (serviceId) result.serviceId = serviceId;
  if (partySize && partySize > 1) result.partySize = partySize;
  if (date) result.date = date;
  if (time) result.time = time;
  if (period && !time) result.period = period;

  // Si menciona servicio, día u hora sin otra intención, es un pedido de turno
  if (intent && intent !== 'greeting') result.intent = intent;
  else if (serviceId || date || time || result.partySize) result.intent = 'book';
  else if (intent) result.intent = intent;
  return result;
}
