/**
 * The recordings of the session: the list on the left (newest first, same two rows as the sidebar), a preview of
 * the selected one on the right, and sticky buttons under the preview to put it into the prompt or remove it.
 *
 * Keys: arrows (and, unadvertised, vim motions) move, `a` / enter insert, `dd` (or `d` twice) remove.
 */
import { usePlugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { createSignal, For, Show } from "solid-js";
import { clock, timeOfDay } from "../../shared/format.ts";
import type { Actions } from "../actions.ts";
import type { State } from "../state.ts";
import { RecordingRow } from "./recording-row.tsx";
import { COLOR, ICON } from "./theme.ts";

export interface RecordingsViewProps {
  state: State;
  actions: Actions;
  sessionID: string | undefined;
  /** Selects this recording when the view opens. */
  recordID?: string;
}

const LIST_LABEL_WIDTH = 34;
/** Rows one list item takes: the scroll position is counted in rows. */
const ITEM_ROWS = 2;
/** The second `d` of `dd` has to come within this long. */
const DD_WINDOW_MS = 700;

export function RecordingsView(props: RecordingsViewProps) {
  const ctx = usePlugin();
  const { state, actions } = props;
  const sessionID = () => props.sessionID ?? state.currentSession();
  const list = () => state.recordingsFor(sessionID());

  // New recordings are prepended (newest first), so follow the selected one by id; the index is only the fallback
  // for when the id is gone (removed), which makes the next item take its place.
  const initial = Math.max(0, list().findIndex((item) => item.id === props.recordID));
  const [selectedIndex, setSelectedIndex] = createSignal(initial);
  const [selectedId, setSelectedId] = createSignal<string | undefined>(list()[initial]?.id);
  const selected = () => {
    const id = selectedId();
    const found = id === undefined ? -1 : list().findIndex((item) => item.id === id);
    return found === -1 ? Math.min(selectedIndex(), Math.max(0, list().length - 1)) : found;
  };
  const selectedRecording = () => list()[selected()];
  const select = (index: number) => {
    setSelectedIndex(index);
    setSelectedId(list()[index]?.id);
  };
  let scroll: { scrollTo(position: number): void } | undefined;
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(list().length - 1, selected() + delta));
    select(next);
    scroll?.scrollTo(Math.max(0, (next - 3) * ITEM_ROWS));
  };

  /** The modal holds focus, so close it first; the prompt gets focus back and then receives the text. */
  const insert = () => {
    const recording = selectedRecording();
    const id = sessionID();
    if (!recording?.ok || !id) return;
    ctx.ui.dialog.clear();
    setTimeout(() => void actions.insert(id, recording.id), 80);
  };
  const remove = () => {
    const recording = selectedRecording();
    const id = sessionID();
    if (!recording || !id) return;
    setSelectedId(undefined);
    state.removeRecording(id, recording.id);
  };

  const [armed, setArmed] = createSignal(false);
  let armedAt = 0;
  const removeKey = () => {
    const now = Date.now();
    if (armed() && now - armedAt < DD_WINDOW_MS) {
      setArmed(false);
      return remove();
    }
    armedAt = now;
    setArmed(true);
    setTimeout(() => {
      if (Date.now() - armedAt >= DD_WINDOW_MS) setArmed(false);
    }, DD_WINDOW_MS + 20);
  };

  ctx.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      { bind: "down", run: () => move(1) },
      { bind: "up", run: () => move(-1) },
      { bind: "j", run: () => move(1) },
      { bind: "k", run: () => move(-1) },
      { bind: "ctrl+d", run: () => move(10) },
      { bind: "ctrl+u", run: () => move(-10) },
      { bind: "home", run: () => move(-100000) },
      { bind: "end", run: () => move(100000) },
      { bind: "g", run: () => move(-100000) },
      { bind: "shift+g", run: () => move(100000) },
      { bind: "a", run: insert },
      { bind: "return", run: insert },
      { bind: "d", run: removeKey },
    ],
  }));

  return (
    <box flexDirection="row" flexGrow={1} flexBasis={0} minHeight={0} gap={2}>
      <scrollbox ref={(el: any) => (scroll = el)} width="40%" flexShrink={0} minHeight={0}>
        <For each={list()}>
          {(recording, index) => (
            <RecordingRow recording={recording} width={LIST_LABEL_WIDTH} active={index() === selected()} onClick={() => select(index())} />
          )}
        </For>
        <Show when={list().length === 0}>
          <text fg={COLOR.muted as any}>{`No recordings in this session yet. ${state.ui.options.recordKeybind} to record.`}</text>
        </Show>
      </scrollbox>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        {/* Keyed: the preview only ever sees a real recording, also when the list empties under it. */}
        <Show when={selectedRecording()} keyed fallback={<text fg={COLOR.muted as any}>Nothing selected.</text>}>
          {(recording) => (
            <>
              <text flexShrink={0} fg={(recording.ok ? COLOR.foam : COLOR.love) as any} attributes={TextAttributes.BOLD}>
                {`${recording.ok ? "✓" : "✗"} ${recording.label}`}
              </text>
              <text flexShrink={0} fg={COLOR.muted as any}>
                {`${timeOfDay(recording.at)} · ${clock(recording.durationMs)}${recording.ok ? (recording.raw ? " · cleaned up" : " · as heard") : ""}${recording.ok && !recording.inserted ? " · not inserted" : ""}`}
              </text>
              <box height={1} flexShrink={0} />
              <scrollbox flexGrow={1} flexBasis={0} minHeight={0}>
                <text fg={ctx.theme.text.base as any} wrapMode="word">{recording.ok ? recording.text : recording.detail}</text>
                <Show when={recording.alternatives?.length}>
                  <box height={1} flexShrink={0} />
                  <text fg={COLOR.iris as any}>{`Other options (tab in the prompt): `}</text>
                  <For each={recording.alternatives}>
                    {(alternative, i) => (
                      <text fg={COLOR.muted as any} wrapMode="word">{`${i() + 2}. ${alternative}`}</text>
                    )}
                  </For>
                </Show>
                <Show when={recording.raw}>
                  <box height={1} flexShrink={0} />
                  <text fg={COLOR.muted as any}>As heard:</text>
                  <text fg={COLOR.muted as any} wrapMode="word">{recording.raw}</text>
                </Show>
              </scrollbox>
              <box height={1} flexShrink={0} border={["top"]} borderColor={COLOR.muted as any} marginTop={1} />
              <box flexDirection="row" flexShrink={0} gap={2}>
                <Show when={recording.ok}>
                  <text fg={COLOR.foam as any} onMouseUp={insert}>{`${ICON.insert} insert into prompt (a)`}</text>
                </Show>
                <text fg={(armed() ? COLOR.gold : COLOR.muted) as any} onMouseUp={remove}>
                  {armed() ? `${ICON.trash} press d again to remove` : `${ICON.trash} remove (dd)`}
                </text>
              </box>
            </>
          )}
        </Show>
      </box>
    </box>
  );
}
