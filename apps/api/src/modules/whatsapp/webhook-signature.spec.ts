import { isValidSignature, sign } from './webhook-signature.js';

describe('firma de webhooks de Meta', () => {
  const secret = 'secreto-de-la-app-123';
  const body = Buffer.from('{"object":"whatsapp_business_account"}');

  it('acepta una firma correcta', () => {
    expect(isValidSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('rechaza firmas incorrectas, ausentes o mal formadas', () => {
    expect(isValidSignature(body, sign(body, 'otro-secreto-cualquiera'), secret)).toBe(false);
    expect(isValidSignature(Buffer.from('{"alterado":true}'), sign(body, secret), secret)).toBe(false);
    expect(isValidSignature(body, undefined, secret)).toBe(false);
    expect(isValidSignature(body, 'sha256=zz', secret)).toBe(false);
    expect(isValidSignature(body, 'md5=abc', secret)).toBe(false);
  });
});
