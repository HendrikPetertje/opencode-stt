import { spawn } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { modelUrl, type WhisperModel } from "../../shared/models.ts";

/** Downloads a model with curl into `dir`, through a `.part` file so a broken download is never picked up. */
export function downloadModel(model: WhisperModel, dir: string): Promise<{ path: string } | { error: string }> {
  return new Promise((resolve) => {
    const target = join(dir, model.file);
    const partial = `${target}.part`;
    try {
      mkdirSync(dir, { recursive: true });
    } catch (error) {
      return resolve({ error: `Cannot create ${dir}: ${(error as Error).message}` });
    }
    const proc = spawn("curl", ["-fL", "--silent", "--show-error", "-o", partial, modelUrl(model.file)], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => void (stderr += chunk.toString()));
    proc.on("error", (error) => resolve({ error: `curl failed: ${error.message}` }));
    proc.on("exit", (code) => {
      if (code !== 0) {
        rmSync(partial, { force: true });
        return resolve({ error: stderr.trim().split("\n").pop() || `curl exited (${code})` });
      }
      try {
        renameSync(partial, target);
        resolve({ path: target });
      } catch (error) {
        resolve({ error: (error as Error).message });
      }
    });
  });
}
