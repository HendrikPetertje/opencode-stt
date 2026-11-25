/**
 * The options tabs above the prompt. After a recording with alternatives went into the prompt, Tab swaps the inserted
 * text for the next option (wrapping round); a click on a tab picks one. Shift+Tab is left alone: OpenCode 2.3 binds it
 * to `agent.cycle`. Plain Tab is bound only to `prompt.autocomplete.complete` (while the `/` or `@` popup is open); the
 * tabs are gone by then, because typing changes the prompt. The tabs go away as soon as the prompt no longer holds exactly
 * what was inserted: typing, backspace, clearing it, history, and Enter (which submits and clears) all change it.
 */
import type { Insertion } from "./composer.ts";
import type { State } from "./state.ts";

/** Safety net next to the key listener: catches changes that come without a key (a mouse paste, a delayed clear). */
const WATCH_MS = 250;
const TAB_PRIORITY = 100;

export function createTabs(state: State) {
  const { context, ui, setUi } = state;
  let insertion: Insertion | undefined;
  let options: string[] = [];
  let index = 0;
  let session = "";
  let watcher: ReturnType<typeof setInterval> | undefined;

  const publish = (count: number, current: number, sessionID: string) => setUi((draft) => void (draft.tabs = { count, index: current, session: sessionID }));

  const dismiss = () => {
    if (watcher) clearInterval(watcher);
    watcher = undefined;
    insertion = undefined;
    options = [];
    index = 0;
    session = "";
    if ((ui.tabs?.count ?? 0) > 0) publish(0, 0, "");
  };

  const verify = () => {
    if (insertion && (!insertion.intact() || state.currentSession() !== session)) dismiss();
  };

  /** Shows the tabs for `texts`, the first of which is in the prompt now. One option needs no tabs. */
  const show = (sessionID: string, inserted: Insertion, texts: readonly string[]) => {
    dismiss();
    if (texts.length < 2) return;
    insertion = inserted;
    options = [...texts];
    session = sessionID;
    publish(texts.length, 0, sessionID);
    watcher = setInterval(verify, WATCH_MS);
  };

  const select = (target: number) => {
    if (!insertion || options.length < 2) return;
    const next = ((target % options.length) + options.length) % options.length;
    if (next === index) return;
    if (insertion.replace(options[next]!)) {
      index = next;
      publish(options.length, next, session);
    } else {
      dismiss();
    }
  };

  // A key or a paste reaches the prompt after this listener: look again once it has been handled.
  const keys = context.renderer.keyInput;
  const onInput = () => {
    if (insertion) setTimeout(verify, 0);
  };
  keys.on("keypress", onInput);
  keys.on("paste", onInput);

  // Only while the tabs are shown, so Tab keeps its own meaning (autocomplete) the rest of the time.
  context.keymap.layer(() => ({
    mode: "global",
    priority: TAB_PRIORITY,
    enabled: () => (ui.tabs?.count ?? 0) > 1,
    commands: [{ bind: "tab", run: () => select(index + 1) }],
  }));

  return {
    show,
    select,
    dismiss,
    dispose: () => {
      dismiss();
      keys.off("keypress", onInput);
      keys.off("paste", onInput);
    },
  };
}

export type Tabs = ReturnType<typeof createTabs>;
