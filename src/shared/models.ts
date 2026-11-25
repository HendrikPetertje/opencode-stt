export interface WhisperModel {
  id: string;
  label: string;
  file: string;
  /** Approximate download size, for the picker. */
  size: string;
  english: boolean;
}

export const WHISPER_MODELS: readonly WhisperModel[] = [
  { id: "tiny.en", label: "Tiny English", file: "ggml-tiny.en.bin", size: "75 MB", english: true },
  { id: "tiny", label: "Tiny multilingual", file: "ggml-tiny.bin", size: "75 MB", english: false },
  { id: "base.en", label: "Base English", file: "ggml-base.en.bin", size: "142 MB", english: true },
  { id: "base", label: "Base multilingual", file: "ggml-base.bin", size: "142 MB", english: false },
  { id: "small.en", label: "Small English", file: "ggml-small.en.bin", size: "466 MB", english: true },
  { id: "small", label: "Small multilingual", file: "ggml-small.bin", size: "466 MB", english: false },
  { id: "medium-q5_0", label: "Medium Q5 multilingual", file: "ggml-medium-q5_0.bin", size: "539 MB", english: false },
  { id: "large-v3-turbo-q5_0", label: "Large v3 Turbo Q5", file: "ggml-large-v3-turbo-q5_0.bin", size: "574 MB", english: false },
  { id: "large-v3-turbo-q8_0", label: "Large v3 Turbo Q8", file: "ggml-large-v3-turbo-q8_0.bin", size: "874 MB", english: false },
  { id: "large-v3-turbo", label: "Large v3 Turbo", file: "ggml-large-v3-turbo.bin", size: "1.6 GB", english: false },
];

export const DEFAULT_WHISPER_MODEL = "base.en";

export const modelById = (id: string): WhisperModel | undefined => WHISPER_MODELS.find((model) => model.id === id);

export const modelUrl = (file: string): string => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`;

/** Full path of an installed model file, or undefined. */
export function findModel(model: WhisperModel, dirs: readonly string[], exists: (path: string) => boolean): string | undefined {
  for (const dir of dirs) {
    const path = `${dir.replace(/\/+$/, "")}/${model.file}`;
    if (exists(path)) return path;
  }
  return undefined;
}
