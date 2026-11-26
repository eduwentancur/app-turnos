import { OggOpusDecoder } from 'ogg-opus-decoder';

/** Frecuencia de muestreo que espera Whisper. */
export const WHISPER_SAMPLE_RATE = 16_000;

/**
 * Decodifica una nota de voz de WhatsApp (OGG/Opus) a PCM mono a 16 kHz.
 * Todo en WebAssembly: no requiere ffmpeg ni binarios instalados.
 */
export async function decodeVoiceNote(data: Uint8Array): Promise<{ samples: Float32Array; seconds: number }> {
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  try {
    const { channelData, sampleRate, samplesDecoded } = await decoder.decodeFile(data);
    if (!samplesDecoded || channelData.length === 0) throw new Error('El audio está vacío o no es OGG/Opus');
    const mono = channelData.length === 1 ? channelData[0] : mixToMono(channelData);
    return { samples: resample(mono, sampleRate, WHISPER_SAMPLE_RATE), seconds: samplesDecoded / sampleRate };
  } finally {
    decoder.free();
  }
}

function mixToMono(channels: Float32Array[]): Float32Array {
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Remuestreo con promedio por ventana (alcanza para voz al bajar de 48 kHz a 16 kHz). */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}
