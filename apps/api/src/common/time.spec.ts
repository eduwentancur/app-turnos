import { addDaysToDate, localToUtc, minutesToTime, timeToMinutes, utcToLocal } from './time.js';

const AR = 'America/Argentina/Buenos_Aires';

describe('time helpers', () => {
  it('convierte HH:mm <-> minutos', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('hora local de Argentina (UTC-3) -> UTC y vuelta', () => {
    const utc = localToUtc('2026-11-18', '16:30', AR);
    expect(utc.toISOString()).toBe('2026-11-18T19:30:00.000Z');
    expect(utcToLocal(utc, AR)).toEqual({ date: '2026-11-18', time: '16:30' });
  });

  it('respeta el cambio de día al convertir', () => {
    expect(utcToLocal(new Date('2026-11-19T01:00:00Z'), AR)).toEqual({ date: '2026-11-18', time: '22:00' });
  });

  it('funciona con zonas con horario de verano', () => {
    // Madrid: invierno UTC+1, verano UTC+2
    expect(localToUtc('2026-01-15', '10:00', 'Europe/Madrid').toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(localToUtc('2026-07-15', '10:00', 'Europe/Madrid').toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('suma días a una fecha cruzando meses y años', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
