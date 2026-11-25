import { emptyCost, formatTokens, formatUsd, type CostTotal } from "./cost.ts";

/** `0:07`, `12:03`. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** `$0.0042 · 3 transcripts · 1.2k tokens · 1 unpriced`. */
export function costLine(cost: CostTotal | undefined): string {
  const total = cost ?? emptyCost();
  const parts = [formatUsd(total), `${total.transcripts} transcript${total.transcripts === 1 ? "" : "s"}`];
  if (total.input + total.output > 0) parts.push(formatTokens(total));
  if (total.unpriced > 0) parts.push(`${total.unpriced} unpriced`);
  return parts.join(" · ");
}

/** `14:03:22`, local time. */
export function timeOfDay(ms: number): string {
  const date = new Date(ms);
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

/** `text` cut to `max` characters, with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1))}…`;
}

/** Partial blocks, one to seven eighths of a cell. */
const EIGHTHS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/**
 * A level bar that only grows to the right, `width` cells wide: `filled` is the loud part (full blocks plus one
 * partial block), `empty` the dotted rest. Together they are always `width` cells.
 */
export function meterBar(level: number, width: number): { filled: string; empty: string } {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  const eighths = Math.round(clamped * width * 8);
  const full = Math.floor(eighths / 8);
  const part = eighths % 8;
  const filled = "█".repeat(full) + (part > 0 ? EIGHTHS[part - 1]! : "");
  return { filled, empty: "·".repeat(Math.max(0, width - full - (part > 0 ? 1 : 0))) };
}
