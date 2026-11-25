import type { Pipeline } from "./pipeline.ts";
import type { State } from "./state.ts";

/** The key layer: record, send, cancel and open the settings. `bind` is the default; cli.json overrides it by id. */
export function registerCommands(state: State, pipeline: Pipeline, open: (sessionID: string | undefined) => void): void {
  const { ui } = state;
  state.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "opencode-stt.record",
        title: "Voice: record / stop and review",
        group: "Voice",
        bind: ui.options.recordKeybind,
        palette: true,
        slash: { name: "stt-record" },
        run: pipeline.record,
      },
      {
        id: "opencode-stt.submit",
        title: "Voice: stop and send",
        group: "Voice",
        bind: ui.options.submitKeybind,
        palette: true,
        slash: { name: "stt-submit" },
        run: pipeline.submit,
      },
      {
        id: "opencode-stt.cancel",
        title: "Voice: cancel recording",
        group: "Voice",
        palette: true,
        slash: { name: "stt-stop" },
        run: pipeline.cancel,
      },
      {
        id: "opencode-stt.open",
        title: "Voice: settings",
        group: "Voice",
        bind: ui.options.keybind,
        palette: true,
        slash: { name: "stt" },
        run: () => open(state.currentSession()),
      },
    ],
    bindings: ["opencode-stt.record", "opencode-stt.submit", "opencode-stt.open"],
  }));
}
