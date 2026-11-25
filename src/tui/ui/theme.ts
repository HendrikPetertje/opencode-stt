import { RGBA } from "@opentui/core";

export const ICON = {
  mic: "\uF130",
  whisper: "\uF2DB",
  language: "\uF0AC",
  normalize: "\uF0D0",
  model: "\uF2DB",
  trim: "\uF0C4",
  reset: "\uF0E2",
  insert: "\uF040",
  trash: "\uF1F8",
  gear: "\uF013",
  logs: "\uF07C",
};
export const SPINNER = ["◜", "◠", "◝", "◞", "◡", "◟"];

// Terminal palette slots, so Ghostty's Rosé Pine (or any theme) supplies the colours. The hex values are only
// used when the terminal palette is unknown.
function ansi(index: number, fallback: string) {
  const from = (RGBA as any)?.fromIndex;
  if (typeof from === "function") {
    try {
      return from.call(RGBA, index, fallback);
    } catch {}
  }
  return fallback;
}

export const COLOR = {
  love: ansi(1, "#eb6f92"),
  pine: ansi(2, "#31748f"),
  gold: ansi(3, "#f6c177"),
  foam: ansi(4, "#9ccfd8"),
  iris: ansi(5, "#c4a7e7"),
  muted: ansi(8, "#6e6a86"),
  surface: ansi(0, "#26233a"),
};
