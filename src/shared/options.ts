export interface Options {
  /** Default normalizer, `provider/model`; the modal's picker overrides it. */
  model?: string;
  /** Default whisper model id (see models.ts). */
  whisperModel: string;
  language: string;
  /** Folder with ggml-*.bin files; downloads go here. */
  modelsDir?: string;
  normalize: boolean;
  trimSilence: boolean;
  /** Path to a replacement normalization system prompt. */
  prompt?: string;
  keybind: string;
  recordKeybind: string;
  submitKeybind: string;
}

const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

export function parseOptions(raw: Record<string, unknown> | undefined): Options {
  const options = raw ?? {};
  return {
    model: typeof options.model === "string" && parseModel(options.model) ? options.model.trim() : undefined,
    whisperModel: text(options.whisperModel, "base.en"),
    language: text(options.language, "en"),
    modelsDir: typeof options.modelsDir === "string" && options.modelsDir.trim() ? options.modelsDir.trim() : undefined,
    normalize: options.normalize !== false,
    trimSilence: options.trimSilence !== false,
    prompt: typeof options.prompt === "string" && options.prompt.trim() ? options.prompt.trim() : undefined,
    keybind: text(options.keybind, "<leader>v"),
    recordKeybind: text(options.recordKeybind, "ctrl+r"),
    submitKeybind: text(options.submitKeybind, "<leader>r"),
  };
}

/** `"github-copilot/claude-haiku-5.5"` -> provider `github-copilot`, model `claude-haiku-5.5`. Model IDs may contain `/`. */
export function parseModel(value: unknown): { providerID: string; id: string } | undefined {
  if (typeof value !== "string") return undefined;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return undefined;
  return { providerID: value.slice(0, slash).trim(), id: value.slice(slash + 1).trim() };
}
