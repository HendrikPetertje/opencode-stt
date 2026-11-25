import type { Options } from "./options.ts";

/** Remembered across projects and sessions (TUI durable storage). */
export interface Settings {
  /** Whisper model id, see models.ts. */
  whisperModel: string;
  language: string;
  /** Input device name; empty is the system default. */
  mic: string;
  normalize: boolean;
  /** Normalizer as `provider/model`; empty until picked or set through the `model` option. */
  model: string;
  trimSilence: boolean;
}

export function defaults(options: Options): Settings {
  return {
    whisperModel: options.whisperModel,
    language: options.language,
    mic: "",
    normalize: options.normalize,
    model: options.model ?? "",
    trimSilence: options.trimSilence,
  };
}

export type RowKey = "whisperModel" | "language" | "mic" | "normalize" | "model" | "trimSilence" | "reset";

export interface Row {
  key: RowKey;
  label: string;
  icon: "whisper" | "language" | "mic" | "normalize" | "model" | "trim" | "reset";
  description: string;
}

export const ROWS: readonly Row[] = [
  { key: "whisperModel", label: "Whisper model", icon: "whisper", description: "space: pick the speech model. Models that aren't downloaded yet can be downloaded from the picker." },
  { key: "language", label: "Language", icon: "language", description: "space: pick the spoken language. English-only models always use English." },
  { key: "mic", label: "Microphone", icon: "mic", description: "space: pick the input device." },
  { key: "normalize", label: "Normalize with LLM", icon: "normalize", description: "Clean up punctuation, filler words and software homophones with the normalizer model. Off: you get whisper's raw text." },
  { key: "model", label: "Normalizer model", icon: "model", description: "space: pick the model that cleans up transcripts. Same provider as your chat model: priced. Other provider: works, but unpriced." },
  { key: "trimSilence", label: "Trim leading silence", icon: "trim", description: "Cut silence at the start of a recording. A recording that is quiet throughout is kept whole. Turn off if the first word gets lost." },
  {
    key: "reset",
    label: "Reset to defaults",
    icon: "reset",
    description: "Forget every change made here and go back to the plugin options in opencode.jsonc (or the built-in defaults). space: reset.",
  },
];

/** Rows that run an action instead of changing a value. */
export const ACTIONS: ReadonlySet<RowKey> = new Set(["reset"]);

/** Rows that open a picker instead of toggling. */
export const PICKERS: ReadonlySet<RowKey> = new Set(["whisperModel", "language", "mic", "model"]);

/** Applies a space/h/l press to a toggle row. */
export function toggle(settings: Settings, key: RowKey, input: "toggle" | "left" | "right"): Settings {
  if (key !== "normalize" && key !== "trimSilence") return settings;
  return { ...settings, [key]: input === "toggle" ? !settings[key] : input === "right" };
}

/** The settings whose value differs from `base` (the plugin options, or the built-in defaults). */
export function changed(current: Settings, base: Settings): (keyof Settings)[] {
  return (Object.keys(base) as (keyof Settings)[]).filter((key) => current[key] !== base[key]);
}
