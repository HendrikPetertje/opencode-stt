/** `text` as it should be inserted after `existing`: a space between them unless one is already there. */
export function joinPrompt(existing: string, text: string): string {
  const addition = text.trim();
  if (!addition) return "";
  return existing.length === 0 || /\s$/.test(existing) ? addition : ` ${addition}`;
}
