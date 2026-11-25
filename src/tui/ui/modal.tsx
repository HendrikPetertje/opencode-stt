/**
 * The voice modal. It opens on the session's recordings (list and preview); `c` switches to the settings (and back).
 */
import { usePlugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { createSignal, Show } from "solid-js";
import { costLine } from "../../shared/format.ts";
import type { Actions } from "../actions.ts";
import type { Pickers } from "../pickers.ts";
import type { State } from "../state.ts";
import { RecordingsView } from "./recordings-view.tsx";
import { SettingsView } from "./settings-view.tsx";
import { COLOR, ICON } from "./theme.ts";

const MODAL_MARGIN = 2;
/** OpenCode's dialog adds one row of top padding around the plugin's content. */
const DIALOG_CHROME = 1;
const MODAL_MIN = 10;
const MODAL_MAX = 28;

type View = "recordings" | "settings";

export interface ModalProps {
  state: State;
  pickers: Pickers;
  actions: Actions;
  sessionID: string | undefined;
  view?: View;
  /** Selects this recording when the list opens. */
  recordID?: string;
  /** Reopens the modal on the settings after a picker dialog closed. */
  reopen: () => void;
}

export function Modal(props: ModalProps) {
  const ctx = usePlugin();
  const { state } = props;
  const { ui } = state;
  const dims = useTerminalDimensions();
  const height = () => Math.max(MODAL_MIN, Math.min(MODAL_MAX, dims().height - 2 * MODAL_MARGIN - DIALOG_CHROME));
  const [view, setView] = createSignal<View>(props.view ?? "recordings");
  const toggleView = () => {
    setView((current) => (current === "settings" ? "recordings" : "settings"));
  };
  const sessionID = () => props.sessionID ?? state.currentSession();

  ctx.keymap.layer(() => ({ mode: "global", priority: 10, commands: [{ bind: "c", run: toggleView }] }));

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} height={height()}>
      <box flexDirection="row" flexShrink={0} justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text fg={COLOR.foam as any} attributes={TextAttributes.BOLD}>{`${ICON.mic} Voice${view() === "settings" ? " · settings" : ""}`}</text>
          <text fg={COLOR.muted as any}>{ui.phase === "idle" ? "" : ui.phase}</text>
        </box>
        <text fg={COLOR.muted as any}>{costLine(state.costFor(sessionID()))}</text>
      </box>
      <box height={1} flexShrink={0} border={["top"]} borderColor={COLOR.muted as any} />
      <Show
        when={view() === "recordings"}
        fallback={<SettingsView state={state} pickers={props.pickers} reopen={props.reopen} />}
      >
        <RecordingsView state={state} actions={props.actions} sessionID={props.sessionID} recordID={props.recordID} />
      </Show>
      <box height={1} flexShrink={0} border={["top"]} borderColor={COLOR.muted as any} marginTop={1} />
      <box flexDirection="row" flexShrink={0} gap={1} flexWrap="wrap">
        <text fg={COLOR.muted as any}>
          {view() === "recordings" ? "esc close · ↑/↓ select · a insert into prompt · dd remove ·" : "esc close · ↑/↓ move · space/enter select · ←/→ change ·"}
        </text>
        <text fg={COLOR.iris as any} onMouseUp={toggleView}>
          {view() === "recordings" ? `${ICON.gear} c config` : `${ICON.mic} c recordings`}
        </text>
      </box>
    </box>
  );
}

/** Shows the modal in OpenCode's dialog; pickers replace it while open and reopen it on the settings when done. */
export function showModal(
  state: State,
  pickers: Pickers,
  actions: Actions,
  sessionID: string | undefined,
  options: { view?: View; recordID?: string } = {},
): void {
  const reopen = () => showModal(state, pickers, actions, sessionID, { view: "settings" });
  state.context.ui.dialog.show(() => (
    <Modal state={state} pickers={pickers} actions={actions} sessionID={sessionID} view={options.view} recordID={options.recordID} reopen={reopen} />
  ));
  state.context.ui.dialog.set({ size: "xlarge", centered: true });
}
