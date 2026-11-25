/** One finished (or failed) recording, as listed in the sidebar and the modal. Stored per root session. */
export interface Recording {
  id: string;
  /** When the recording started (ms since epoch). */
  at: number;
  /** How long was recorded. */
  durationMs: number;
  ok: boolean;
  /** Success: one or two words naming the topic, or "success". Failure: a short reason ("too short"). */
  label: string;
  /** Failure: the full error. */
  detail?: string;
  /** Success: the final text (cleaned when the normalizer ran). */
  text?: string;
  /** Success: other plausible versions of `text`, shown as tabs above the prompt after inserting. */
  alternatives?: string[];
  /** Success: whisper's raw text, when it differs from `text`. */
  raw?: string;
  /** The text went into the prompt (or was sent). */
  inserted?: boolean;
}

/** Short failure reasons, small enough for the sidebar. */
export const REASON = {
  tooShort: "too short",
  noAudio: "no audio",
  noSpeech: "no speech",
  noModel: "no model",
  whisper: "whisper failed",
  mic: "mic error",
  error: "error",
} as const;

/** Recordings kept per session. */
export const MAX_RECORDINGS = 50;
/** Rows in the sidebar widget. */
export const SIDEBAR_RECORDINGS = 5;

/** Newest first, capped. */
export function withRecording(list: readonly Recording[], recording: Recording): Recording[] {
  return [recording, ...list.filter((item) => item.id !== recording.id)].slice(0, MAX_RECORDINGS);
}

export const withoutRecording = (list: readonly Recording[], id: string): Recording[] => list.filter((item) => item.id !== id);

export const withInserted = (list: readonly Recording[], id: string): Recording[] =>
  list.map((item) => (item.id === id ? { ...item, inserted: true } : item));

export function newRecordingId(at: number, counter: number): string {
  return `${at.toString(36)}-${counter.toString(36)}`;
}
