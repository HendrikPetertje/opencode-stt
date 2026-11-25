/** One recording on two rows: `✓ 14:03:22 · 0:07` and, below it, the summary or the failure reason. */
import { usePlugin } from "@opencode/plugin/tui";
import { clip, clock, timeOfDay } from "../../shared/format.ts";
import type { Recording } from "../../shared/recording.ts";
import { COLOR } from "./theme.ts";

export interface RecordingRowProps {
  recording: Recording;
  /** Longest text on the second row. */
  width: number;
  active?: boolean;
  onClick?: () => void;
}

export function RecordingRow(props: RecordingRowProps) {
  const ctx = usePlugin();
  const mark = () => {
    const { ok, inserted } = props.recording;
    if (!ok) return { glyph: "✗", color: COLOR.love };
    return { glyph: "✓", color: inserted ? COLOR.foam : COLOR.gold };
  };
  const label = () => {
    const { ok, inserted, label } = props.recording;
    return ok && !inserted ? `${label} · not inserted` : label;
  };
  return (
    <box flexDirection="column" flexShrink={0} backgroundColor={props.active ? (COLOR.surface as any) : undefined} onMouseUp={props.onClick}>
      <box flexDirection="row">
        <text fg={mark().color as any}>{`${mark().glyph} `}</text>
        <text fg={ctx.theme.text.base as any}>{timeOfDay(props.recording.at)}</text>
        <text fg={COLOR.muted as any}>{` · ${clock(props.recording.durationMs)}`}</text>
      </box>
      <text fg={(props.recording.ok ? COLOR.muted : COLOR.love) as any}>{`  ${clip(label(), props.width)}`}</text>
    </box>
  );
}
