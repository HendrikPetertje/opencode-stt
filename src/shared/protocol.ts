import type { CallUsage } from "./cost.ts";

/** What the TUI sends to the server's `normalize` method. */
export interface NormalizeInput {
  /** The session the transcript is for: a priced call runs on it, and its cost is charged to it. */
  sessionID?: string;
  /** Normalizer as `provider/model`. */
  model: string;
  /** Raw whisper text. */
  text: string;
  /** Session title, to resolve "that function" and similar. */
  title?: string;
}

/**
 * `usage` is null when the call could not be priced (`generate.text` fallback). `alternatives` are other plausible versions of the text (at most two), `summary` is one or two words naming the
 * topic; both only when the model gave them.
 */
export type NormalizeReply =
  | { text: string; alternatives: string[]; summary?: string; usage: CallUsage | null }
  | { error: string };
