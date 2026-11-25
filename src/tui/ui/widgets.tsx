/**
 * The sidebar widget, and the recording status in the bottom bar:
 *
 *   ● Voice  $0.0031            sidebar: title with the session's price
 *   ● recording 0:07            live row, only while recording or working (the dot blinks)
 *   ✓ 14:03:22 · 0:07           the last recordings, newest first
 *     fix login
 *
 *   🎤 ████▌····· 0:07          far left of the bottom bar while recording: a level bar that only grows to the right, then the time
 */
import { usePlugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { For, onCleanup, onMount, Show } from "solid-js";
import { emptyCost, formatUsd } from "../../shared/cost.ts";
import { clock, meterBar } from "../../shared/format.ts";
import { SIDEBAR_RECORDINGS } from "../../shared/recording.ts";
import type { Actions } from "../actions.ts";
import type { State } from "../state.ts";
import { RecordingRow } from "./recording-row.tsx";
import { COLOR, ICON, SPINNER } from "./theme.ts";

export interface WidgetProps {
  state: State;
  actions: Actions;
  sessionID?: string;
}

/** Cells of the level bar in the bottom bar. */
const METER_WIDTH = 10;
const SIDEBAR_LABEL_WIDTH = 30;

const shortcut = (state: State) => state.context.keymap.shortcuts("opencode-stt.record")?.[0] ?? state.ui.options.recordKeybind;

/** Shown only while recording or working; collapses when idle so the finished recording moves into the list. */
function LiveRow(props: { state: State }) {
  const { ui } = props.state;
  const spin = () => SPINNER[ui.frame % SPINNER.length];
  return (
    <Show when={ui.phase !== "idle"}>
      <Show
        when={ui.phase === "recording"}
        fallback={
          <box flexDirection="row">
            <text fg={COLOR.gold as any}>{`${spin()} `}</text>
            <text fg={COLOR.muted as any}>{ui.phase === "transcribing" ? "transcribing…" : "cleaning up…"}</text>
          </box>
        }
      >
        <box flexDirection="row">
          {/* A plain blinking dot; the level bar lives in the bottom bar. */}
          <text fg={COLOR.love as any}>{ui.frame % 8 < 4 ? "● " : "  "}</text>
          <text fg={COLOR.love as any}>recording</text>
          <text fg={COLOR.muted as any}>{` ${clock(props.state.elapsed())}`}</text>
        </box>
      </Show>
    </Show>
  );
}

export function Sidebar(props: WidgetProps) {
  const ctx = usePlugin();
  const { state, actions } = props;
  const { ui, setUi } = state;
  // A new chat draws the sidebar before its session exists, and the slot does not pass the new ID; follow the route.
  const sessionID = () => state.currentSession() ?? props.sessionID;
  onMount(() => setUi((draft) => void (draft.sidebars += 1)));
  onCleanup(() => setUi((draft) => void (draft.sidebars = Math.max(0, draft.sidebars - 1))));

  const all = () => state.recordingsFor(sessionID());
  const open = () => actions.open(sessionID());
  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" gap={1} onMouseUp={open}>
        <text fg={(ui.phase === "recording" ? COLOR.love : COLOR.foam) as any}>{ICON.mic}</text>
        <text fg={ctx.theme.text.base as any} attributes={TextAttributes.BOLD}>Voice</text>
        <text fg={COLOR.muted as any} marginLeft={1}>{formatUsd(state.costFor(sessionID()) ?? emptyCost())}</text>
      </box>
      <LiveRow state={state} />
      <For each={all().slice(0, SIDEBAR_RECORDINGS)}>
        {(recording) => (
          <RecordingRow
            recording={recording}
            width={SIDEBAR_LABEL_WIDTH}
            // A finished recording goes back into the prompt; a failed one has nothing to insert, so show why.
            onClick={() => {
              const id = sessionID();
              if (!id) return;
              if (recording.ok) actions.insert(id, recording.id);
              else actions.open(id, recording.id);
            }}
          />
        )}
      </For>
      <Show when={all().length === 0 && ui.phase === "idle"}>
        <text fg={COLOR.muted as any} onMouseUp={open}>{`${shortcut(state)} to record`}</text>
      </Show>
      <Show when={all().length > SIDEBAR_RECORDINGS}>
        <text fg={COLOR.muted as any} onMouseUp={open}>{`… ${all().length - SIDEBAR_RECORDINGS} more`}</text>
      </Show>
    </box>
  );
}

/**
 * Far left of the bottom bar, in front of the folder and branch (or the `esc interrupt` hint while the agent works,
 * which must stay visible): the recording, as a mic, a level bar that only grows to the right, and the time.
 * Shown while recording only, also next to an open sidebar.
 */
export function RecordingStatus(props: WidgetProps) {
  const { state, actions } = props;
  const { ui } = state;
  const sessionID = () => state.currentSession() ?? props.sessionID;
  const bar = () => meterBar(ui.level, METER_WIDTH);
  return (
    <Show when={ui.phase === "recording"}>
      <box flexDirection="row" flexShrink={0} gap={1} onMouseUp={() => actions.open(sessionID())}>
        <text fg={COLOR.love as any}>{ICON.mic}</text>
        <box flexDirection="row">
          <text fg={COLOR.love as any}>{bar().filled}</text>
          <text fg={COLOR.muted as any}>{bar().empty}</text>
        </box>
        <text fg={COLOR.muted as any}>{clock(state.elapsed())}</text>
      </box>
    </Show>
  );
}

/**
 * After the other items of the bottom bar: a small microphone while idle and a spinner while the recording is
 * worked on. Only when there is no sidebar to say so (and in a new chat, which has none).
 */
export function FooterIcon(props: WidgetProps) {
  const { state, actions } = props;
  const { ui } = state;
  const sessionID = () => state.currentSession() ?? props.sessionID;
  const working = () => ui.phase === "transcribing" || ui.phase === "normalizing";
  return (
    <Show when={ui.sidebars === 0 && ui.phase !== "recording"}>
      <box flexDirection="row" flexShrink={0} onMouseUp={() => actions.open(sessionID())}>
        <text fg={(working() ? COLOR.gold : COLOR.muted) as any}>{working() ? SPINNER[ui.frame % SPINNER.length] : ICON.mic}</text>
      </box>
    </Show>
  );
}
