import { readFileSync } from "node:fs";
import { logError } from "../system/log.ts";
import { expandHome } from "../system/paths.ts";

/** The replacement system prompt from the `prompt` option, or undefined when unset or unreadable. */
export function loadPromptFile(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    return readFileSync(expandHome(path), "utf8");
  } catch (error) {
    logError(`prompt file ${path}`, error);
    return undefined;
  }
}
