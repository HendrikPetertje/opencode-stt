export type Backend = "coreaudio" | "pulseaudio" | "default";

export interface InputDevice {
  /** Passed to sox. */
  name: string;
  /** Shown in the picker. */
  label: string;
}

export const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
export const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE;
/** whisper.cpp skips audio shorter than this. */
export const MIN_SECONDS = 1;
/** A chunk quieter than this (RMS, full scale = 1) is silence when trimming. About -48 dBFS. */
export const ONSET_RMS = 0.004;

export function recordArgs(backend: Backend, mic: string | undefined): string[] {
  if (backend === "pulseaudio") return ["-t", "pulseaudio", mic || "default"];
  if (backend === "coreaudio" && mic) return ["-t", "coreaudio", mic];
  return ["-d"];
}

/** Raw 16 kHz mono 16-bit samples on stdout: the plugin measures the level, trims, and writes the wav itself. */
export function outputArgs(): string[] {
  return ["-t", "raw", "-r", String(SAMPLE_RATE), "-c", "1", "-b", "16", "-e", "signed-integer", "-"];
}

export function parsePactlSources(json: string): InputDevice[] {
  const data = JSON.parse(json);
  return (Array.isArray(data) ? data : [])
    .filter((source: any) => source?.name && !String(source.name).endsWith(".monitor"))
    .map((source: any) => ({
      name: source.name,
      label: source.description ? `${source.description} (${source.name})` : source.name,
    }));
}

/** Root mean square of 16-bit little-endian samples, 0..1. */
export function pcmRms(pcm: Uint8Array): number {
  const samples = pcm.length >> 1;
  if (samples === 0) return 0;
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples * BYTES_PER_SAMPLE);
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const value = view.getInt16(i * BYTES_PER_SAMPLE, true) / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}

/** A 0..1 meter value: -60 dBFS is empty, -15 dBFS is full, so a quiet microphone still moves the bar. */
export function levelOf(rms: number): number {
  if (!(rms > 0)) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 45));
}

export interface Chunk {
  bytes: number;
  rms: number;
}

/**
 * Byte offset to start from when trimming leading silence: the chunk before the first loud one (a little
 * lead-in), or 0 when nothing was loud, so a very quiet recording is kept whole instead of thrown away.
 */
export function trimOffset(chunks: readonly Chunk[], threshold = ONSET_RMS): number {
  const first = chunks.findIndex((chunk) => chunk.rms >= threshold);
  if (first <= 0) return 0;
  return chunks.slice(0, first - 1).reduce((sum, chunk) => sum + chunk.bytes, 0);
}

export const seconds = (bytes: number): number => bytes / BYTES_PER_SECOND;

/** A 16 kHz mono 16-bit PCM wav file. */
export function wavBytes(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, BYTES_PER_SECOND, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
