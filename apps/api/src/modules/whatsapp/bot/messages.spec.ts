import { buttons, list, text } from './messages.js';
import { fromCloudApiMessage, toCloudApiPayload } from './cloud-api.mapper.js';

describe('mensajes de WhatsApp', () => {
  it('recorta títulos a los límites de WhatsApp', () => {
    const msg = list('Elegí', 'Ver horarios disponibles hoy', [
      { title: 'Una sección con título larguísimo', rows: [{ id: 'A', title: 'Corte + Barba + Cejas + Lavado', description: 'x'.repeat(100) }] },
    ]);
    expect(msg.button).toHaveLength(20);
    expect(msg.sections[0].title).toHaveLength(24);
    expect(msg.sections[0].rows[0].title).toHaveLength(24);
    expect(msg.sections[0].rows[0].title.endsWith('…')).toBe(true);
    expect(msg.sections[0].rows[0].description).toHaveLength(72);
  });

  it('rechaza listas de más de 10 filas y más de 3 botones', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: String(i), title: String(i) }));
    expect(() => list('x', 'Ver', [{ rows }])).toThrow();
    expect(() => buttons('x', [1, 2, 3, 4].map((i) => ({ id: String(i), title: String(i) })))).toThrow();
  });

  it('genera el payload de lista de la Cloud API', () => {
    const payload = toCloudApiPayload('+5493764000000', list('Elegí horario', 'Ver horarios', [{ title: 'Mañana', rows: [{ id: 'SLOT:1', title: '09:00' }] }]));
    expect(payload).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5493764000000',
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Elegí horario' },
        action: { button: 'Ver horarios', sections: [{ title: 'Mañana', rows: [{ id: 'SLOT:1', title: '09:00' }] }] },
      },
    });
  });

  it('genera payloads de texto y botones', () => {
    expect(toCloudApiPayload('549', text('Hola'))).toMatchObject({ type: 'text', text: { body: 'Hola' } });
    expect(toCloudApiPayload('549', buttons('¿Confirmás?', [{ id: 'YES', title: 'Sí' }]))).toMatchObject({
      interactive: { type: 'button', action: { buttons: [{ type: 'reply', reply: { id: 'YES', title: 'Sí' } }] } },
    });
  });

  it('interpreta mensajes entrantes del webhook', () => {
    expect(fromCloudApiMessage({ id: 'w1', from: '549', type: 'text', text: { body: 'hola' } })).toEqual({ type: 'text', text: 'hola' });
    expect(
      fromCloudApiMessage({ id: 'w2', from: '549', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'SLOT:x', title: '09:00' } } }),
    ).toEqual({ type: 'reply', id: 'SLOT:x', title: '09:00' });
    expect(fromCloudApiMessage({ id: 'w3', from: '549', type: 'image' })).toBeNull();
  });
});
