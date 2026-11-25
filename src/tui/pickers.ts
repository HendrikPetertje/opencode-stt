/** The selection dialogs behind the settings rows. Each one saves the choice, then calls `done` to reopen the modal. */
import { modelById, WHISPER_MODELS } from "../shared/models.ts";
import type { RowKey } from "../shared/settings.ts";
import { LANGUAGES } from "../shared/whisper.ts";
import { detectBackend, listInputDevices } from "./engine/devices.ts";
import { installedPath, modelDirs } from "./engine/model-files.ts";
import type { State } from "./state.ts";

export type Picker = (done: () => void) => Promise<void>;
export type Pickers = Partial<Record<RowKey, Picker>>;

export function createPickers(state: State, download: (id: string) => Promise<void>): Pickers {
  const { context, ui, settings, save } = state;

  const whisperModel: Picker = async (done) => {
    const value = await context.ui.dialog.select<string>({
      title: "Whisper model",
      placeholder: "Search models",
      current: settings().whisperModel,
      options: WHISPER_MODELS.map((model) => {
        const installed = installedPath(model, ui.options.modelsDir) !== undefined;
        return {
          title: model.label,
          value: model.id,
          description: `${installed ? "installed" : "not downloaded"} · ${model.size}${model.english ? " · English only" : ""}`,
          category: installed ? "Installed" : "Download",
        };
      }),
    });
    const model = value ? modelById(value) : undefined;
    if (model && installedPath(model, ui.options.modelsDir)) {
      save("whisperModel", model.id);
    } else if (model) {
      const ok = await context.ui.dialog.confirm({
        title: `Download ${model.label}?`,
        message: `${model.size} from huggingface.co/ggerganov/whisper.cpp, saved in ${modelDirs(ui.options.modelsDir)[0]}.`,
        label: { confirm: "Download" },
      });
      if (ok) void download(model.id);
    }
    done();
  };

  const language: Picker = async (done) => {
    const value = await context.ui.dialog.select<string>({
      title: "Spoken language",
      current: settings().language,
      options: Object.entries(LANGUAGES).map(([code, label]) => ({ title: label, value: code, description: code })),
    });
    if (value) save("language", value);
    done();
  };

  const mic: Picker = async (done) => {
    const value = await context.ui.dialog.select<string>({
      title: "Microphone",
      current: settings().mic,
      options: [{ title: "System default", value: "" }, ...listInputDevices(detectBackend()).map((device) => ({ title: device.label, value: device.name }))],
    });
    if (value !== undefined) save("mic", value);
    done();
  };

  const normalizer: Picker = async (done) => {
    let models = context.data.location.model.list() ?? [];
    if (models.length === 0) {
      await context.data.location.model.sync().catch(() => {});
      models = context.data.location.model.list() ?? [];
    }
    const value = await context.ui.dialog.select<string>({
      title: "Voice normalizer model",
      placeholder: "Search models",
      current: settings().model,
      options: models
        .filter((model: any) => !model.type || model.type === "chat" || model.type === "language")
        .map((model: any) => ({
          title: model.name ?? model.modelID,
          value: `${model.providerID}/${model.modelID}`,
          description: `${model.providerID}/${model.modelID}`,
          category: model.providerID,
        })),
    });
    if (value) save("model", value);
    done();
  };

  return { whisperModel, language, mic, model: normalizer };
}
