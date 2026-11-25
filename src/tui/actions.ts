/** What the UI can ask for; built in tui.tsx from the modal and the pipeline, so components never import either. */
export interface Actions {
  /** Opens the modal on the recordings, optionally with one selected. */
  open(sessionID: string | undefined, recordID?: string): void;
  /** Puts a recording's text into the prompt. False when that was not possible. */
  insert(sessionID: string, recordID: string): boolean;
}
