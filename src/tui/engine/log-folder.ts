import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { stateDir } from "../../system/paths.ts";

/** The log folder as shown in settings, with the home folder as `~`. */
export function logFolderLabel(): string {
  const dir = stateDir();
  const home = homedir();
  return dir.startsWith(`${home}/`) ? `~/${dir.slice(home.length + 1)}` : dir;
}

/** Opens the log folder in the OS file manager (Finder on macOS). */
export function openLogFolder(): void {
  const dir = stateDir();
  try {
    mkdirSync(dir, { recursive: true });
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    spawn(opener, [dir], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {}
}
