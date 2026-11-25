import { execFileSync } from "node:child_process";
import { parsePactlSources, type Backend, type InputDevice } from "../../shared/audio.ts";

export function detectBackend(): Backend {
  if (process.platform === "darwin") return "coreaudio";
  try {
    execFileSync("pactl", ["--version"], { stdio: "ignore", timeout: 3000 });
    return "pulseaudio";
  } catch {
    return "default";
  }
}

export function listInputDevices(backend: Backend): InputDevice[] {
  try {
    if (backend === "coreaudio") {
      const json = execFileSync("system_profiler", ["SPAudioDataType", "-json"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
      const items: any[] = JSON.parse(json).SPAudioDataType?.[0]?._items ?? [];
      return items
        .filter((item) => item.coreaudio_input_source != null)
        .map((item) => {
          const name = String(item.coreaudio_device_name || item._name);
          return { name, label: name };
        });
    }
    if (backend === "pulseaudio") {
      return parsePactlSources(execFileSync("pactl", ["-f", "json", "list", "sources"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }));
    }
  } catch {}
  return [];
}

/** Whether a program is on PATH. */
export function onPath(program: string): boolean {
  try {
    execFileSync("which", [program], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** What is missing to record and transcribe: a short label for the sidebar and the fix for the user. */
export function missingTool(): { label: string; detail: string } | undefined {
  if (!onPath("sox")) return { label: "sox missing", detail: "sox not found: brew install sox" };
  if (!onPath("whisper-cli")) return { label: "whisper missing", detail: "whisper-cli not found: brew install whisper-cpp" };
  return undefined;
}
