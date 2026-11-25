/** Running normalization cost for one root session. Whisper itself runs locally and is free. */
export interface CostTotal {
  usd: number;
  /** Transcripts recorded in the session, normalized or not. */
  transcripts: number;
  /** Normalization calls made. */
  calls: number;
  /** Calls whose cost is unknown (the `generate.text` fallback reports none). */
  unpriced: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyCost = (): CostTotal => ({
  usd: 0,
  transcripts: 0,
  calls: 0,
  unpriced: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

export interface CallUsage {
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
}

/** A transcript that was not normalized (normalization off or failed). */
export function addTranscript(total: CostTotal): CostTotal {
  return { ...total, transcripts: total.transcripts + 1 };
}

/** A transcript plus the normalization call that cleaned it up. */
export function addUsage(total: CostTotal, usage: CallUsage | undefined): CostTotal {
  const next = { ...total, transcripts: total.transcripts + 1, calls: total.calls + 1 };
  if (!usage || typeof usage.cost !== "number" || !Number.isFinite(usage.cost)) {
    next.unpriced += 1;
    return next;
  }
  next.usd += usage.cost;
  next.input += usage.tokens?.input ?? 0;
  next.output += (usage.tokens?.output ?? 0) + (usage.tokens?.reasoning ?? 0);
  next.cacheRead += usage.tokens?.cache?.read ?? 0;
  next.cacheWrite += usage.tokens?.cache?.write ?? 0;
  return next;
}

/** `$0.0042`, `$0.13`, `$2.40`; a trailing `+` when some calls had no price. */
export function formatUsd(total: CostTotal): string {
  const digits = total.usd === 0 ? 2 : total.usd < 0.1 ? 4 : 2;
  return `$${total.usd.toFixed(digits)}${total.unpriced > 0 ? "+" : ""}`;
}

/** `12 tokens`, `1.2k tokens`. */
export function formatTokens(total: CostTotal): string {
  const tokens = total.input + total.output;
  return `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tokens`;
}

/** Keeps only the newest `max` sessions; ids are ordered by last use (object key order). */
export function prune<T>(sessions: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(sessions);
  if (keys.length <= max) return sessions;
  return Object.fromEntries(keys.slice(-max).map((key) => [key, sessions[key]!]));
}
