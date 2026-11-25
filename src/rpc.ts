import { Rpc } from "@opencode/plugin/rpc";

const object = { type: "object" } as const;

/**
 * Recording and transcription run in the TUI. The server owns the plugin
 * options (the TUI does not receive them) and the normalization call: models
 * and their prices are reachable from there.
 */
export const Stt = Rpc.define({
  id: "opencode-stt",
  methods: {
    config: { input: object, output: object },
    normalize: { input: object, output: object },
  },
  events: {},
});
