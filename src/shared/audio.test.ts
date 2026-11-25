import { describe, expect, test } from "bun:test";
import { BYTES_PER_SECOND, levelOf, ONSET_RMS, outputArgs, parsePactlSources, pcmRms, recordArgs, seconds, trimOffset, wavBytes } from "./audio.ts";

const pcm = (...samples: number[]) => {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  return bytes;
};

describe("sox", () => {
  test("input per backend", () => {
    expect(recordArgs("coreaudio", undefined)).toEqual(["-d"]);
    expect(recordArgs("coreaudio", "MacBook Pro Microphone")).toEqual(["-t", "coreaudio", "MacBook Pro Microphone"]);
    expect(recordArgs("pulseaudio", undefined)).toEqual(["-t", "pulseaudio", "default"]);
    expect(recordArgs("default", "x")).toEqual(["-d"]);
  });

  test("output is raw 16 kHz mono 16-bit on stdout", () => {
    expect(outputArgs()).toEqual(["-t", "raw", "-r", "16000", "-c", "1", "-b", "16", "-e", "signed-integer", "-"]);
  });

  test("pactl sources skip monitors", () => {
    const json = JSON.stringify([
      { name: "mic", description: "Mic" },
      { name: "out.monitor", description: "Monitor" },
      { name: "plain" },
    ]);
    expect(parsePactlSources(json)).toEqual([
      { name: "mic", label: "Mic (mic)" },
      { name: "plain", label: "plain" },
    ]);
  });
});

describe("levels", () => {
  test("rms of silence, a full-scale square wave and a half-scale one", () => {
    expect(pcmRms(pcm(0, 0, 0, 0))).toBe(0);
    expect(pcmRms(pcm(32767, -32768, 32767, -32768))).toBeCloseTo(1, 3);
    expect(pcmRms(pcm(16384, -16384))).toBeCloseTo(0.5, 3);
    expect(pcmRms(new Uint8Array(0))).toBe(0);
  });

  test("a trailing odd byte is ignored", () => {
    const bytes = new Uint8Array([...pcm(16384), 7]);
    expect(pcmRms(bytes)).toBeCloseTo(0.5, 3);
  });

  test("the meter: empty at -60 dB, full at -15 dB, a quiet voice in between", () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(0.0005)).toBe(0);
    expect(levelOf(0.178)).toBeCloseTo(1, 1);
    expect(levelOf(1)).toBe(1);
    expect(levelOf(0.01)).toBeGreaterThan(0.3);
    expect(levelOf(0.01)).toBeLessThan(0.6);
    expect(levelOf(Number.NaN)).toBe(0);
  });
});

describe("trimming leading silence", () => {
  const quiet = { bytes: 100, rms: ONSET_RMS / 10 };
  const loud = { bytes: 100, rms: ONSET_RMS * 4 };

  test("starts one chunk before the first loud one", () => {
    expect(trimOffset([quiet, quiet, quiet, loud, quiet])).toBe(200);
  });

  test("keeps a lead-in when speech starts at once", () => {
    expect(trimOffset([loud, quiet])).toBe(0);
    expect(trimOffset([quiet, loud])).toBe(0);
  });

  test("a recording that is quiet throughout is kept whole", () => {
    expect(trimOffset([quiet, quiet, quiet])).toBe(0);
    expect(trimOffset([])).toBe(0);
  });
});

describe("wav", () => {
  test("header and length", () => {
    const wav = wavBytes(pcm(1, 2, 3));
    const view = new DataView(wav.buffer);
    expect(wav.length).toBe(44 + 6);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44 + 4, true)).toBe(3);
  });

  test("seconds", () => {
    expect(seconds(BYTES_PER_SECOND * 3)).toBe(3);
    expect(seconds(BYTES_PER_SECOND / 2)).toBe(0.5);
  });
});
