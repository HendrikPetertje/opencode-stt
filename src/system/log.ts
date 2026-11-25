import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stateDir } from "./paths.ts";

/** Lines kept per log file. */
export const MAX_LINES = 1000;
/** Trim once a file is this far over, so it isn't rewritten on every append. */
const SLACK = 50;

let ready: Promise<unknown> | undefined;
/** One queue per file: appends and trims never interleave. */
const queues = new Map<string, Promise<void>>();
/** Line counts, read from disk on the first append to each file. */
const counts = new Map<string, number>();

/** The last `max` lines of `text`, newline-terminated. */
export function keepLast(text: string, max: number): string {
  const lines = text.split("\n").filter((line) => line.length > 0);
  return lines.length === 0 ? "" : `${lines.slice(-max).join("\n")}\n`;
}

async function write(file: string, line: string): Promise<void> {
  ready ??= mkdir(stateDir(), { recursive: true });
  await ready;
  const path = join(stateDir(), file);
  if (!counts.has(file)) {
    const existing = await readFile(path, "utf8").catch(() => "");
    counts.set(file, existing.split("\n").filter((l) => l.length > 0).length);
  }
  await appendFile(path, `${line}\n`);
  const count = (counts.get(file) ?? 0) + 1;
  if (count < MAX_LINES + SLACK) {
    counts.set(file, count);
    return;
  }
  const trimmed = keepLast(await readFile(path, "utf8"), MAX_LINES);
  await writeFile(path, trimmed);
  counts.set(file, MAX_LINES);
}

function append(file: string, line: string): void {
  const previous = queues.get(file) ?? Promise.resolve();
  queues.set(
    file,
    previous.then(() => write(file, line)).catch(() => {}),
  );
}


function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return "";
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {}
  }
  return String(error);
}

/** Plugin errors, for debugging (latest 1000 kept). */
export function logError(message: string, error?: unknown): void {
  const detail = describeError(error);
  append("plugin.log", `${new Date().toISOString()} ${message}${detail ? `: ${detail}` : ""}`);
}
