import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import type { Env } from '../../../config/env.validation.js';
import { decodeVoiceNote, WHISPER_SAMPLE_RATE } from './audio-decoder.js';

export interface Transcription {
  text: string;
  seconds: number;
}

export class AudioTooLongError extends Error {
  constructor(public readonly seconds: number, public readonly max: number) {
    super(`Audio de ${Math.round(seconds)} s (máximo ${max} s)`);
  }
}

/** Token de inyección: permite reemplazar el motor de transcripción (o mockearlo en tests). */
export const TRANSCRIBER = Symbol('TRANSCRIBER');

export interface Transcriber {
  readonly enabled: boolean;
  /** Nota de voz de WhatsApp (OGG/Opus). */
  transcribeVoiceNote(data: Uint8Array): Promise<Transcription>;
  /** PCM mono a 16 kHz (lo usa el simulador, que graba desde el navegador). */
  transcribePcm(samples: Float32Array): Promise<Transcription>;
}

type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

/**
 * Whisper ejecutándose en el propio servidor con transformers.js (ONNX, CPU).
 * - El modelo se descarga una sola vez y queda en caché.
 * - Se carga recién con el primer audio (o con `pnpm --filter api model:download`).
 * - Las transcripciones se procesan de a una para no saturar la CPU.
 */
@Injectable()
export class LocalWhisperTranscriber implements Transcriber {
  private readonly logger = new Logger(LocalWhisperTranscriber.name);
  readonly enabled: boolean;
  private readonly model: string;
  private readonly cacheDir: string;
  private readonly maxSeconds: number;
  private pipelinePromise?: Promise<AsrPipeline>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(config: ConfigService<Env, true>) {
    this.enabled = config.get('TRANSCRIPTION_ENABLED', { infer: true });
    this.model = config.get('TRANSCRIPTION_MODEL', { infer: true });
    this.cacheDir = config.get('TRANSCRIPTION_CACHE_DIR', { infer: true }) ?? resolve(process.cwd(), '.cache', 'models');
    this.maxSeconds = config.get('TRANSCRIPTION_MAX_SECONDS', { infer: true });
  }

  async transcribeVoiceNote(data: Uint8Array): Promise<Transcription> {
    const { samples, seconds } = await decodeVoiceNote(data);
    return this.run(samples, seconds);
  }

  transcribePcm(samples: Float32Array): Promise<Transcription> {
    return this.run(samples, samples.length / WHISPER_SAMPLE_RATE);
  }

  /** Descarga y carga el modelo (si todavía no está). */
  load(): Promise<AsrPipeline> {
    this.pipelinePromise ??= (async () => {
      const started = Date.now();
      this.logger.log(`Cargando modelo de transcripción ${this.model} (la primera vez se descarga, ~250 MB)…`);
      const { env, pipeline } = await import('@huggingface/transformers');
      env.cacheDir = this.cacheDir;
      const asr = (await pipeline('automatic-speech-recognition', this.model, { dtype: 'q8', device: 'cpu' })) as unknown as AsrPipeline;
      this.logger.log(`Modelo de transcripción listo en ${((Date.now() - started) / 1000).toFixed(1)} s`);
      return asr;
    })().catch((error: unknown) => {
      this.pipelinePromise = undefined; // permitir reintentar
      throw error;
    });
    return this.pipelinePromise;
  }

  private async run(samples: Float32Array, seconds: number): Promise<Transcription> {
    if (!this.enabled) throw new Error('La transcripción de audios está desactivada');
    if (seconds > this.maxSeconds) throw new AudioTooLongError(seconds, this.maxSeconds);

    const job = this.queue.then(async () => {
      const asr = await this.load();
      const started = Date.now();
      const out = await asr(samples, { language: 'spanish', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
      this.logger.log(`Audio de ${seconds.toFixed(1)} s transcripto en ${Date.now() - started} ms`);
      return { text, seconds };
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}
