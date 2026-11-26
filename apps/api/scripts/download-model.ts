/**
 * Descarga el modelo de transcripción de audios por adelantado, para que el primer
 * audio de un cliente no tenga que esperar la descarga (~250 MB).
 * Uso: pnpm --filter api model:download
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const model = process.env.TRANSCRIPTION_MODEL || 'onnx-community/whisper-small';
env.cacheDir = process.env.TRANSCRIPTION_CACHE_DIR || resolve(process.cwd(), '.cache', 'models');

console.log(`Descargando ${model} en ${env.cacheDir} …`);
const started = Date.now();
await pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'cpu' });
console.log(`[OK] Modelo listo en ${((Date.now() - started) / 1000).toFixed(0)} s`);
