export const DEFAULT_LANGUAGE = "auto";

/** Curated list for the picker; the `language` option accepts any whisper.cpp language code. */
export const LANGUAGES: Readonly<Record<string, string>> = {
  auto: "Auto-detect",
  en: "English",
  nl: "Dutch",
  sv: "Swedish",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

/** English-only models reject (or ignore) other languages, so always ask them for English. */
export function languageFor(language: string | undefined, english: boolean): string {
  if (english) return "en";
  return language || DEFAULT_LANGUAGE;
}

export function whisperArgs(modelPath: string, wavFile: string, language: string): string[] {
  return ["-m", modelPath, "-f", wavFile, "-l", language, "-np", "-nt"];
}

/** whisper-cli prints annotations like `[BLANK_AUDIO]` or `(music)` for non-speech; drop them. */
export function cleanTranscript(stdout: string): string {
  return stdout
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** whisper-cli exits 0 for an unknown language and only prints the error. */
export function languageError(stderr: string): string | undefined {
  const match = stderr.match(/error: unknown language '([^']+)'/);
  return match ? `Unknown whisper language: ${match[1]}` : undefined;
}
