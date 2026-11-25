import { joinPrompt } from "../shared/text.ts";

interface Editable {
  insertText(text: string): void;
  setText?(text: string): void;
  plainText?: string;
  cursorOffset?: number;
}

const editable = (value: unknown): value is Editable => typeof (value as Editable | null)?.insertText === "function";

/** Length of the text two strings start with in common. */
function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Where `addition` went into `before` to make `after`. The cursor is tried first; otherwise the end of the common
 * prefix and a little before it (the text can start with the character that follows it). Each candidate is checked
 * exactly, so an unclear case gives undefined rather than a wrong guess.
 */
export function locate(before: string, after: string, addition: string, cursor?: number): number | undefined {
  const fits = (at: number) => at >= 0 && at <= before.length && after === before.slice(0, at) + addition + before.slice(at);
  if (cursor !== undefined && fits(cursor)) return cursor;
  const prefix = commonPrefix(before, after);
  for (let at = prefix; at >= Math.max(0, prefix - addition.length); at--) if (fits(at)) return at;
  return undefined;
}

/** What was put into the prompt, kept so it can be swapped for another option until the user edits the prompt. */
export interface Insertion {
  /** The prompt still holds exactly what was inserted (or last swapped in). */
  intact(): boolean;
  /** Replaces the inserted text. False when the prompt was edited meanwhile, or cannot be set. */
  replace(text: string): boolean;
}

/**
 * Inserts text at the cursor of the focused text input, which is the prompt while you dictate (no dialog opens
 * and OpenCode has no API for writing into the composer). Returns undefined when nothing editable has focus, so the
 * caller can keep the text elsewhere instead of losing it.
 */
export function insertIntoComposer(renderer: unknown, text: string): Insertion | undefined {
  const focused = (renderer as { currentFocusedRenderable?: unknown } | undefined)?.currentFocusedRenderable;
  if (!editable(focused)) return undefined;
  try {
    const before = focused.plainText ?? "";
    const cursor = typeof focused.cursorOffset === "number" ? focused.cursorOffset : undefined;
    const addition = joinPrompt(before, text);
    if (!addition) return undefined;
    // The separator in front (a space, unless the prompt is empty or ends in whitespace) stays when swapping.
    const lead = addition.length - addition.trimStart().length;
    focused.insertText(addition);

    const after = focused.plainText ?? "";
    const start = locate(before, after, addition, cursor);
    let current = after;
    let length = addition.length;
    return {
      intact: () => (focused.plainText ?? "") === current,
      replace: (option) => {
        if (start === undefined || typeof focused.setText !== "function" || (focused.plainText ?? "") !== current) return false;
        try {
          const inserted = addition.slice(0, lead) + option.trim();
          const next = current.slice(0, start) + inserted + current.slice(start + length);
          focused.setText(next);
          // setText may move the cursor; put it back after the swapped text.
          try {
            focused.cursorOffset = start + inserted.length;
          } catch {}
          current = next;
          length = inserted.length;
          return true;
        } catch {
          return false;
        }
      },
    };
  } catch {
    return undefined;
  }
}
