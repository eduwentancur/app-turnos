import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CloudApiClient } from '../src/modules/whatsapp/cloud-api.client.js';
import { WhatsappAccountResolver, type WhatsappAccount } from '../src/modules/whatsapp/whatsapp-account.resolver.js';
import { sign } from '../src/modules/whatsapp/webhook-signature.js';
import { AudioTooLongError, TRANSCRIBER } from '../src/modules/whatsapp/audio/transcriber.js';
import type { OutgoingMessage } from '../src/modules/whatsapp/bot/messages.js';
import { createTestApp } from './utils/create-test-app.js';
import { createTenant, type TestTenant } from './utils/fixtures.js';

const SECRET = 'app-secret-de-prueba-123456';
const VERIFY = 'verify-token-de-prueba';
const PHONE_NUMBER_ID = '1234567890';

describe('Webhook de WhatsApp (e2e)', () => {
  let app: NestExpressApplication;
  let tenant: TestTenant;
  const sent: { to: string; messages: OutgoingMessage[] }[] = [];
  const read: string[] = [];
  let account: WhatsappAccount | null = null;

  const client = {
    sendAll: vi.fn(async (_acc: WhatsappAccount, to: string, messages: OutgoingMessage[]) => {
      sent.push({ to, messages });
    }),
    markAsRead: vi.fn(async (_acc: WhatsappAccount, id: string) => {
      read.push(id);
    }),
    downloadMedia: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const transcriber = {
    enabled: true,
    transcribeVoiceNote: vi.fn(async () => ({ text: 'Hola, ¿cuánto sale el corte?', seconds: 3 })),
    transcribePcm: vi.fn(async (samples: Float32Array) => ({ text: 'quiero cancelar mi turno', seconds: samples.length / 16000 })),
  };
  const resolver = {
    isConfigured: () => true,
    resolve: async (id: string) => (id === PHONE_NUMBER_ID ? account : null),
  };

  beforeAll(async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY;
    app = await createTestApp({
      customize: (b) =>
        b
          .overrideProvider(CloudApiClient)
          .useValue(client)
          .overrideProvider(WhatsappAccountResolver)
          .useValue(resolver)
          .overrideProvider(TRANSCRIBER)
          .useValue(transcriber),
    });
    tenant = await createTenant(app);
    account = { barbershopId: tenant.barbershopId, phoneNumberId: PHONE_NUMBER_ID, accessToken: 'x' };
  });

  afterAll(async () => {
    await tenant.cleanup();
    await app.close();
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  const payload = (message: object, phoneNumberId = PHONE_NUMBER_ID) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: phoneNumberId },
              contacts: [{ wa_id: '5493764666000', profile: { name: 'Sofía Gómez' } }],
              messages: [{ from: '5493764666000', timestamp: '1795700000', ...message }],
            },
          },
        ],
      },
    ],
  });

  const post = (body: object, signature?: string) => {
    const raw = JSON.stringify(body);
    return request(app.getHttpServer())
      .post('/api/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature ?? sign(raw, SECRET))
      .send(raw);
  };

  const waitFor = async (cond: () => boolean) => {
    for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
    expect(cond()).toBe(true);
  };

  it('verifica la URL con el token correcto', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '987654' })
      .expect(200);
    expect(ok.text).toBe('987654');
    await request(app.getHttpServer())
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' })
      .expect(403);
  });

  it('rechaza webhooks sin firma válida', async () => {
    await post(payload({ id: 'wamid.FAKE', type: 'text', text: { body: 'hola' } }), 'sha256=00').expect(403);
    expect(client.sendAll).not.toHaveBeenCalled();
  });

  it('responde al cliente con el menú, usando su nombre de perfil', async () => {
    await post(payload({ id: 'wamid.A1', type: 'text', text: { body: 'Hola' } })).expect(200);
    await waitFor(() => sent.length === 1);
    expect(read).toContain('wamid.A1');
    expect(sent[0].to).toBe('5493764666000');
    const menu = sent[0].messages.at(-1)!;
    expect(menu.type).toBe('list');
    expect(menu.type === 'list' && menu.body).toContain('Sofía');
  });

  it('procesa una sola vez un webhook repetido', async () => {
    await post(payload({ id: 'wamid.A1', type: 'text', text: { body: 'Hola' } })).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(sent).toHaveLength(1);
  });

  it('responde a opciones de listas (list_reply)', async () => {
    await post(
      payload({ id: 'wamid.A2', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'MENU:SERVICES', title: 'Servicios y precios' } } }),
    ).expect(200);
    await waitFor(() => sent.length === 2);
    const reply = sent[1].messages[0];
    expect(reply.type === 'buttons' && reply.body).toContain('servicios');
  });

  it('transcribe las notas de voz y responde a lo que pidió', async () => {
    await post(payload({ id: 'wamid.A3', type: 'audio', audio: { id: 'media-1', voice: true } })).expect(200);
    await waitFor(() => sent.length === 3);
    expect(client.downloadMedia).toHaveBeenCalledWith(expect.anything(), 'media-1');
    const [heard, answer] = sent[2].messages;
    expect(heard.type === 'text' && heard.text).toBe('🎧 Entendí: "Hola, ¿cuánto sale el corte?"');
    // "¿cuánto sale?" = intención de ver precios (esta barbería de prueba no tiene servicios)
    expect(answer.type === 'buttons' && answer.body).toContain('servicios');
  });

  it('avisa si el audio es muy largo y explica que no entiende imágenes', async () => {
    transcriber.transcribeVoiceNote.mockRejectedValueOnce(new AudioTooLongError(200, 90));
    await post(payload({ id: 'wamid.A5', type: 'audio', audio: { id: 'media-2' } })).expect(200);
    await waitFor(() => sent.length === 4);
    expect(sent[3].messages[0].type === 'buttons' && sent[3].messages[0].body).toContain('menos de 90 segundos');

    await post(payload({ id: 'wamid.A6', type: 'image', image: { id: 'img' } })).expect(200);
    await waitFor(() => sent.length === 5);
    expect(sent[4].messages[0].type === 'buttons' && sent[4].messages[0].body).toContain('solo entiendo');
  });

  it('simulador: transcribe un audio grabado en el navegador', async () => {
    const owner = await tenant.tokenFor('OWNER');
    const pcm = Buffer.from(new Int16Array(16000).buffer).toString('base64'); // 1 s de silencio
    const res = await request(app.getHttpServer())
      .post('/api/whatsapp/simulator/audio')
      .set('Authorization', `Bearer ${owner}`)
      .send({ phone: '3764 123123', pcm16: pcm })
      .expect(200);
    expect(res.body.transcript).toBe('quiero cancelar mi turno');
    expect(transcriber.transcribePcm).toHaveBeenCalledWith(expect.any(Float32Array));
    expect(res.body.replies[0].text).toContain('🎧 Entendí');
  });

  it('ignora números no configurados', async () => {
    await post(payload({ id: 'wamid.A4', type: 'text', text: { body: 'hola' } }, '999')).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(sent).toHaveLength(5);
  });
});
