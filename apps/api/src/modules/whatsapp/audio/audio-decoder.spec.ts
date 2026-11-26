import { resample } from './audio-decoder.js';

describe('resample', () => {
  it('baja de 48 kHz a 16 kHz promediando de a 3 muestras', () => {
    const input = Float32Array.from([0, 0.3, 0.6, 1, 1, 1, -1, -1, -1]);
    const out = resample(input, 48_000, 16_000);
    expect(Array.from(out).map((v) => Number(v.toFixed(2)))).toEqual([0.3, 1, -1]);
  });

  it('no toca el audio si la frecuencia ya es la correcta', () => {
    const input = Float32Array.from([0.1, 0.2]);
    expect(resample(input, 16_000, 16_000)).toBe(input);
  });
});
