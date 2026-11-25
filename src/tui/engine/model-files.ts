import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findModel, type WhisperModel } from "../../shared/models.ts";
import { expandHome } from "../../system/paths.ts";

/** Where model files are looked up; the first folder is also where downloads go. */
export function modelDirs(custom?: string): string[] {
  return [
    custom ? expandHome(custom) : join(homedir(), ".local", "share", "whisper-cpp"),
    "/opt/homebrew/share/whisper-cpp/models",
    "/usr/local/share/whisper-cpp/models",
  ];
}

/** Full path of a model on disk, or undefined when it is not downloaded. */
export const installedPath = (model: WhisperModel, custom?: string): string | undefined => findModel(model, modelDirs(custom), existsSync);
