import { calculateSlots, groupByPeriod, type BarberDaySchedule } from './slot-calculator.js';

const TZ = 'America/Argentina/Buenos_Aires';
const DATE = '2030-06-10';
// Instante UTC de una hora local del día de prueba (Argentina = UTC-3)
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00-03:00`);
const PAST = new Date('2000-01-01T00:00:00Z');

function run(barbers: BarberDaySchedule[], opts: { duration?: number; step?: number; notBefore?: Date } = {}) {
  return calculateSlots({
    date: DATE,
    timezone: TZ,
    durationMinutes: opts.duration ?? 30,
    stepMinutes: opts.step ?? 30,
    notBefore: opts.notBefore ?? PAST,
    barbers,
  });
}

const bruno = (ranges: [string, string][], busy: [string, string][] = []): BarberDaySchedule => ({
  barberId: 'bruno',
  ranges: ranges.map(([startTime, endTime]) => ({ startTime, endTime })),
  busy: busy.map(([s, e]) => ({ start: at(s), end: at(e) })),
});

const times = (slots: { localTime: string }[]) => slots.map((s) => s.localTime);

describe('calculateSlots', () => {
  it('genera horarios dentro de cada franja respetando el descanso', () => {
    const slots = run([bruno([['09:00', '11:00'], ['16:00', '17:00']])]);
    expect(times(slots)).toEqual(['09:00', '09:30', '10:00', '10:30', '16:00', '16:30']);
  });

  it('no ofrece un horario si el servicio no entra antes del cierre', () => {
    const slots = run([bruno([['09:00', '11:00']])], { duration: 45 });
    expect(times(slots)).toEqual(['09:00', '09:30', '10:00']);
  });

  it('excluye horarios que se superponen con turnos o bloqueos', () => {
    const slots = run([bruno([['09:00', '12:00']], [['10:00', '10:45']])], { duration: 30 });
    // 09:30-10:00 entra justo (fin exclusivo); 10:00 y 10:30 chocan; 11:00 libre
    expect(times(slots)).toEqual(['09:00', '09:30', '11:00', '11:30']);
  });

  it('un turno que termina justo cuando empieza otro no bloquea', () => {
    const slots = run([bruno([['09:00', '10:00']], [['09:00', '09:30']])]);
    expect(times(slots)).toEqual(['09:30']);
  });

  it('respeta la anticipación mínima (no ofrece horarios pasados)', () => {
    const slots = run([bruno([['09:00', '12:00']])], { notBefore: at('10:15') });
    expect(times(slots)).toEqual(['10:30', '11:00', '11:30']);
  });

  it('con paso de 15 min y servicio de 45 ofrece más opciones', () => {
    const slots = run([bruno([['09:00', '10:30']])], { duration: 45, step: 15 });
    expect(times(slots)).toEqual(['09:00', '09:15', '09:30', '09:45']);
  });

  it('combina varios barberos: un horario está libre si al menos uno lo está', () => {
    const ana: BarberDaySchedule = {
      barberId: 'ana',
      ranges: [{ startTime: '09:00', endTime: '10:00' }],
      busy: [{ start: at('09:30'), end: at('10:00') }],
    };
    const slots = run([bruno([['09:00', '10:00']], [['09:00', '09:30']]), ana]);
    expect(slots.map((s) => [s.localTime, s.barberIds])).toEqual([
      ['09:00', ['ana']],
      ['09:30', ['bruno']],
    ]);
  });

  it('devuelve instantes UTC correctos', () => {
    const [slot] = run([bruno([['16:30', '17:00']])]);
    expect(slot.start.toISOString()).toBe('2030-06-10T19:30:00.000Z');
    expect(slot.end.toISOString()).toBe('2030-06-10T20:00:00.000Z');
  });

  it('día sin franjas = sin horarios', () => {
    expect(run([bruno([])])).toEqual([]);
  });
});

describe('groupByPeriod', () => {
  it('agrupa en Mañana / Tarde / Noche y omite las vacías', () => {
    const slots = run([bruno([['11:00', '14:30'], ['19:00', '20:00']])], { duration: 30, step: 60 });
    const periods = groupByPeriod(slots, { afternoonStartsAt: '14:00', eveningStartsAt: '19:00' });
    expect(periods.map((p) => [p.label, times(p.slots)])).toEqual([
      ['Mañana', ['11:00', '12:00', '13:00']],
      ['Tarde', ['14:00']],
      ['Noche', ['19:00']],
    ]);
  });
});
