/**
 * opencode-stt, server part: serves the plugin options to the TUI over RPC and cleans up transcripts with a model
 * from the user's own OpenCode providers (src/server/normalizer.ts). Recording and whisper run in the TUI.
 *
 *   { "package": "./configured-plugins/opencode-stt", "options": { "model": "github-copilot/claude-haiku-5.5" } }
 *
 * The normalizer is set up in a try block so a problem with its hooks is logged and the settings still load.
 */
import { Plugin } from "@opencode/plugin";
import { createNormalizer, type Normalizer } from "./src/server/normalizer.ts";
import { loadPromptFile } from "./src/server/prompt-file.ts";
import { parseOptions } from "./src/shared/options.ts";
import { systemPrompt } from "./src/shared/prompt.ts";
import { Stt } from "./src/rpc.ts";
import { logError } from "./src/system/log.ts";

export default Plugin.define({
  id: "opencode-stt",
  async setup(ctx) {
    const options = parseOptions(ctx.options as Record<string, unknown>);

    let normalizer: Normalizer | undefined;
    try {
      normalizer = await createNormalizer(ctx, systemPrompt(loadPromptFile(options.prompt)));
    } catch (error) {
      logError("normalizer could not start", error);
    }

    const registration = await ctx.rpc.register(Stt, {
      config: async () => ({ ...options }),
      normalize: async (input: any) => normalizer?.normalize(input) ?? { error: "The normalizer could not start; see the log" },
    });

    return async () => {
      await Promise.allSettled([normalizer?.dispose(), registration.dispose()]);
    };
  },
});
