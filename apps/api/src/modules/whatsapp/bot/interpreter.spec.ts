import { interpret } from './interpreter.js';

// Jueves 26/11/2026
const ctx = {
  today: '2026-11-26',
  services: [
    { id: 'corte', name: 'Corte' },
    { id: 'barba', name: 'Barba' },
    { id: 'corte-barba', name: 'Corte + Barba' },
    { id: 'completo', name: 'Corte + Barba + Ceja' },
    { id: 'color', name: 'Color de cabello' },
  ],
};
const run = (text: string) => interpret(text, ctx);

describe('interpret: pedidos completos', () => {
  it.each([
    ['Hola, quiero un corte para mañana a la tarde, tipo 5', { intent: 'book', serviceId: 'corte', date: '2026-11-27', time: '17:00' }],
    ['necesito turno para corte y barba el sábado a las 10 y media', { intent: 'book', serviceId: 'corte-barba', date: '2026-11-28', time: '10:30' }],
    ['me podés hacer corte + barba + ceja el 3/12 a las 18hs', { intent: 'book', serviceId: 'completo', date: '2026-12-03', time: '18:00' }],
    ['turno para hoy 19:30', { intent: 'book', date: '2026-11-26', time: '19:30' }],
    ['tenés lugar el viernes a las cinco y media?', { intent: 'book', date: '2026-11-27', time: '17:30' }],
    ['quiero sacar turno pasado mañana a la mañana', { intent: 'book', date: '2026-11-28', period: 'MORNING' }],
    ['una barba mañana a la mañana tipo 11', { intent: 'book', serviceId: 'barba', date: '2026-11-27', time: '11:00' }],
    ['color el 15 de diciembre al mediodía', { intent: 'book', serviceId: 'color', date: '2026-12-15', time: '12:00' }],
  ])('%s', (text, expected) => {
    expect(run(text)).toEqual(expected);
  });
});

describe('interpret: fechas', () => {
  it.each([
    ['el jueves', '2026-11-26'],
    ['el jueves que viene', '2026-12-03'],
    ['el lunes', '2026-11-30'],
    ['el 28', '2026-11-28'],
    ['el 5', '2026-12-05'],
    ['10/01', '2027-01-10'],
    ['3 de enero', '2027-01-03'],
  ])('%s → %s', (text, date) => {
    expect(run(`turno ${text}`).date).toBe(date);
  });

  it('ignora fechas imposibles', () => {
    expect(run('turno el 31/11').date).toBeUndefined();
  });
});

describe('interpret: horas', () => {
  it.each([
    ['a las 5', '17:00'],
    ['a las 5 de la mañana', '05:00'],
    ['a las 9', '09:00'],
    ['a las 10 y cuarto', '10:15'],
    ['a las 6 menos cuarto', '17:45'],
    ['17 y 30', undefined],
    ['para las 17 y 30', '17:30'],
    ['tipo 7 de la noche', '19:00'],
    ['a las 12', '12:00'],
    ['a la 1', '13:00'],
    ['18.15', '18:15'],
  ])('%s → %s', (text, time) => {
    expect(run(`turno mañana ${text}`).time).toBe(time);
  });

  it('solo franja: a la tarde / a la noche', () => {
    expect(run('turno mañana a la tarde')).toMatchObject({ period: 'AFTERNOON', date: '2026-11-27' });
    expect(run('turno el viernes por la noche')).toMatchObject({ period: 'EVENING' });
  });
});

describe('interpret: servicios', () => {
  it('elige el servicio más específico', () => {
    expect(run('corte y barba').serviceId).toBe('corte-barba');
    expect(run('corte').serviceId).toBe('corte');
    expect(run('cortes').serviceId).toBe('corte');
  });

  it('coincidencia parcial si no es ambigua', () => {
    expect(run('quiero teñirme, color').serviceId).toBe('color');
    expect(run('cabello').serviceId).toBe('color');
  });
});

describe('interpret: intenciones', () => {
  it.each([
    ['quiero cancelar mi turno', 'cancel'],
    ['no voy a poder ir mañana', 'cancel'],
    ['puedo cambiar el turno para otro día?', 'reschedule'],
    ['qué turno tengo?', 'mine'],
    ['cuánto sale el corte?', 'services'],
    ['dónde están ubicados?', 'info'],
    ['hola', 'greeting'],
    ['buenas tardes', 'greeting'],
  ])('%s → %s', (text, intent) => {
    expect(run(text).intent).toBe(intent);
  });

  it('texto sin nada reconocible', () => {
    expect(run('jaja dale')).toEqual({});
  });
});
