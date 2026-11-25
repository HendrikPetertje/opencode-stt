import { spawn } from "node:child_process";
import { cleanTranscript, languageError, whisperArgs } from "../../shared/whisper.ts";

const TIMEOUT_MS = 120_000;

export type Transcription = { text: string } | { error: string };

export function transcribe(modelPath: string, wavFile: string, language: string): Promise<Transcription> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn("whisper-cli", whisperArgs(modelPath, wavFile, language), { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ error: `Transcription timed out (${TIMEOUT_MS / 1000}s)` });
    }, TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => void (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => void (stderr += chunk.toString()));
    proc.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        error: (error as NodeJS.ErrnoException).code === "ENOENT" ? "whisper-cli not found: brew install whisper-cpp" : `Transcription failed: ${error.message}`,
      });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      const bad = languageError(stderr);
      if (bad) return resolve({ error: bad });
      if (code !== 0) return resolve({ error: stderr.trim().split("\n").pop() || `whisper-cli exited (${code})` });
      resolve({ text: cleanTranscript(stdout) });
    });
  });
}
