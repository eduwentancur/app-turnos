/** Graba audio del micrófono y lo convierte a PCM 16 bits mono a 16 kHz (lo que espera Whisper). */
export class VoiceRecorder {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
  }

  /** Detiene la grabación y devuelve el audio en base64 (PCM16 16 kHz) y su duración. */
  async stop(): Promise<{ pcm16: string; seconds: number }> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("No hay grabación en curso");
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    this.stream?.getTracks().forEach((t) => t.stop());

    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    const ctx = new AudioContext({ sampleRate: 16_000 });
    try {
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const samples = buffer.getChannelData(0);
      const int16 = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return { pcm16: toBase64(new Uint8Array(int16.buffer)), seconds: buffer.duration };
    } finally {
      void ctx.close();
    }
  }

  cancel(): void {
    this.recorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
