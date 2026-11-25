/** The settings: pick and save the voice models, toggle normalization, reset. */
import { usePlugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { createSignal } from "solid-js";
import { modelById } from "../../shared/models.ts";
import { ACTIONS, PICKERS, ROWS, toggle, type RowKey } from "../../shared/settings.ts";
import { LANGUAGES } from "../../shared/whisper.ts";
import { missingTool } from "../engine/devices.ts";
import { logFolderLabel, openLogFolder } from "../engine/log-folder.ts";
import { installedPath } from "../engine/model-files.ts";
import type { Pickers } from "../pickers.ts";
import type { State } from "../state.ts";
import { COLOR, ICON } from "./theme.ts";

export interface SettingsViewProps {
  state: State;
  pickers: Pickers;
  /** Reopens the modal on the settings after a picker dialog closed. */
  reopen: () => void;
}

/** Normalizations are only priced when the normalizer is on the chat model's provider. */
function ModelMatch(props: { state: State }) {
  const message = () => {
    const { settings, context } = props.state;
    const current = context.ui.model.current();
    const normalizer = settings().model;
    const provider = normalizer.split("/")[0];
    if (!settings().normalize) return { color: COLOR.muted, text: "Normalization is off: transcripts go in as whisper wrote them." };
    if (!normalizer) return { color: COLOR.love, text: "No normalizer model: press space on Normalizer model to pick one." };
    if (!current) return { color: COLOR.muted, text: "Keep the normalizer on the same provider as your chat model to get a price." };
    if (current.providerID === provider) {
      return { color: COLOR.muted, text: `Normalizer and chat model (${current.providerID}/${current.modelID}) share a provider: transcripts are priced.` };
    }
    return {
      color: COLOR.gold,
      text: `Normalizer (${provider}) and chat model (${current.providerID}) are on different providers: it works, but the cost shows as unpriced (+).`,
    };
  };
  return <text fg={message().color as any}>{message().text}</text>;
}

export function SettingsView(props: SettingsViewProps) {
  const ctx = usePlugin();
  const { state } = props;
  const { ui, settings, save } = state;
  const [row, setRow] = createSignal(0);
  let scroll: { scrollTo(position: number): void } | undefined;

  const flip = (key: RowKey, input: "toggle" | "left" | "right") => {
    if (key === "normalize" || key === "trimSilence") save(key, toggle(settings(), key, input)[key]);
  };
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(ROWS.length - 1, row() + delta));
    setRow(next);
    scroll?.scrollTo(Math.max(0, next - 3));
  };
  const sideways = (step: -1 | 1) => {
    const current = ROWS[row()]!;
    if (!PICKERS.has(current.key) && !ACTIONS.has(current.key)) flip(current.key, step < 0 ? "left" : "right");
  };
  const reset = () => {
    const count = state.changedSettings().length;
    state.resetSettings();
    state.toast(count === 0 ? "Nothing to reset: already on the defaults" : "Settings reset to the plugin options", count === 0 ? "info" : "success");
  };
  /** space, enter or a click on a row: reset, open its picker, or toggle it. */
  const activate = (index: number) => {
    const current = ROWS[index];
    if (!current) return;
    setRow(index);
    const pick = props.pickers[current.key];
    if (ACTIONS.has(current.key)) reset();
    else if (pick) void pick(props.reopen);
    else flip(current.key, "toggle");
  };

  ctx.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      { bind: "j", run: () => move(1) },
      { bind: "k", run: () => move(-1) },
      { bind: "down", run: () => move(1) },
      { bind: "up", run: () => move(-1) },
      { bind: "g", run: () => move(-100) },
      { bind: "shift+g", run: () => move(100) },
      { bind: "h", run: () => sideways(-1) },
      { bind: "l", run: () => sideways(1) },
      { bind: "left", run: () => sideways(-1) },
      { bind: "right", run: () => sideways(1) },
      { bind: "space", run: () => activate(row()) },
      { bind: "return", run: () => activate(row()) },
    ],
  }));

  const display = (key: RowKey): { text: string; color: unknown } => {
    const current = settings();
    switch (key) {
      case "whisperModel": {
        if (ui.downloading) return { text: `downloading ${modelById(ui.downloading)?.label ?? ui.downloading}…`, color: COLOR.gold };
        const model = modelById(current.whisperModel);
        const installed = model ? installedPath(model, ui.options.modelsDir) !== undefined : false;
        return { text: `${model?.label ?? current.whisperModel}${installed ? "" : " (not downloaded)"}`, color: installed ? COLOR.foam : COLOR.love };
      }
      case "language":
        return { text: LANGUAGES[current.language] ?? current.language, color: COLOR.gold };
      case "mic":
        return { text: current.mic || "system default", color: current.mic ? COLOR.gold : COLOR.muted };
      case "model":
        return { text: current.model || "not set", color: current.model ? COLOR.gold : COLOR.love };
      case "normalize":
        return { text: current.normalize ? "on" : "off", color: current.normalize ? COLOR.foam : COLOR.muted };
      case "trimSilence":
        return { text: current.trimSilence ? "on" : "off", color: current.trimSilence ? COLOR.foam : COLOR.muted };
      case "reset": {
        const count = state.changedSettings().length;
        return { text: count === 0 ? "nothing changed" : `${count} changed from the defaults`, color: count === 0 ? COLOR.muted : COLOR.gold };
      }
    }
  };

  return (
    <scrollbox ref={(el: any) => (scroll = el)} flexGrow={1} flexBasis={0} minHeight={0}>
      {ROWS.map((setting, index) => (
        <box
          flexDirection="row"
          flexShrink={0}
          gap={1}
          backgroundColor={index === row() ? (COLOR.surface as any) : undefined}
          onMouseUp={() => activate(index)}
        >
          <text fg={COLOR.iris as any}>{ICON[setting.icon]}</text>
          <text fg={ctx.theme.text.base as any} width={22}>{setting.label}</text>
          <text fg={display(setting.key).color as any} attributes={TextAttributes.BOLD}>{display(setting.key).text}</text>
        </box>
      ))}
      <box flexDirection="row" flexShrink={0} gap={1} onMouseUp={openLogFolder}>
        <text fg={COLOR.iris as any}>{ICON.logs}</text>
        <text fg={ctx.theme.text.base as any} width={22}>Open log folder</text>
        <text fg={COLOR.iris as any} attributes={TextAttributes.BOLD}>{logFolderLabel()}</text>
      </box>
      <box height={1} flexShrink={0} />
      <text fg={COLOR.muted as any}>{ROWS[row()]?.description ?? ""}</text>
      <box height={1} flexShrink={0} />
      <ModelMatch state={state} />
      {missingTool() && <text fg={COLOR.love as any}>{missingTool()!.detail}</text>}
      <text fg={COLOR.muted as any}>Settings are remembered across sessions and projects.</text>
    </scrollbox>
  );
}
