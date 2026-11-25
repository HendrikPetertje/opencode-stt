/**
 * Record -> whisper -> normalize -> into the prompt. One recording at a time; the transcript goes to the session the
 * recording was started in. Every outcome, success or failure, becomes a `Recording` in the session's list: the
 * sidebar and the modal show it, so nothing in here toasts about background work.
 */
import { MIN_SECONDS } from "../shared/audio.ts";
import { modelById, type WhisperModel } from "../shared/models.ts";
import type { NormalizeReply } from "../shared/protocol.ts";
import { REASON } from "../shared/recording.ts";
import { languageFor } from "../shared/whisper.ts";
import { logError } from "../system/log.ts";
import { insertIntoComposer } from "./composer.ts";
import { detectBackend, missingTool } from "./engine/devices.ts";
import { downloadModel } from "./engine/download.ts";
import { installedPath, modelDirs } from "./engine/model-files.ts";
import { Recorder, removeOnExit, sweepStale } from "./engine/recorder.ts";
import { transcribe } from "./engine/transcribe.ts";
import type { State } from "./state.ts";
import type { Tabs } from "./tabs.ts";

type Delivery = "prompt" | "send";

export function createPipeline(state: State, tabs: Tabs) {
  const { context, ui, setUi, settings, save, toast, setPhase } = state;
  const backend = detectBackend();
  const recorder = new Recorder();
  sweepStale();
  const stopExitCleanup = removeOnExit(recorder.file);
  /** The session the current recording was started in. */
  let target: string | undefined;

  const whisperModel = (): { model: WhisperModel; path: string } | { error: string } => {
    const id = settings().whisperModel;
    const model = modelById(id);
    const path = model ? installedPath(model, ui.options.modelsDir) : undefined;
    return model && path
      ? { model, path }
      : { error: `Whisper model ${id} is not downloaded. Open the voice settings (${ui.options.keybind}) to pick or download one.` };
  };

  const failed = (sessionID: string, at: number, durationMs: number, label: string, detail: string) =>
    void state.addRecording(sessionID, { at, durationMs, ok: false, label, detail });

  const start = () => {
    const sessionID = state.currentSession();
    if (!sessionID) return toast("Open a session before using voice input", "warning");
    const missing = missingTool();
    if (missing) return failed(sessionID, Date.now(), 0, missing.label, missing.detail);
    const found = whisperModel();
    if ("error" in found) return failed(sessionID, Date.now(), 0, REASON.noModel, found.error);

    target = sessionID;
    tabs.dismiss();
    recorder.start({
      backend,
      mic: settings().mic || undefined,
      trimSilence: settings().trimSilence,
      onLevel: state.pushLevel,
      onFailure: (message) => {
        if (ui.phase !== "recording") return;
        const at = ui.startedAt;
        setPhase("idle");
        failed(sessionID, at, Date.now() - at, REASON.mic, message);
      },
    });
    setPhase("recording");
  };

  /** Raw text in, cleaned text, alternatives and summary out; the cost is charged to the session either way. */
  const normalize = async (sessionID: string, raw: string): Promise<{ text: string; alternatives: string[]; label: string }> => {
    const current = settings();
    if (!current.normalize || !current.model) {
      state.addCost(sessionID, "none");
      return { text: raw, alternatives: [], label: "success" };
    }
    setPhase("normalizing");
    try {
      const reply = (await state.rpc().normalize(
        { sessionID, model: current.model, text: raw, title: context.data.session.get(sessionID)?.title },
        { location: state.location() },
      )) as NormalizeReply;
      if ("text" in reply) {
        state.addCost(sessionID, reply.usage ?? undefined);
        return { text: reply.text, alternatives: reply.alternatives ?? [], label: reply.summary || "success" };
      }
      logError("normalize", reply.error);
    } catch (error) {
      logError("tui normalize", error);
    }
    state.addCost(sessionID, "none");
    return { text: raw, alternatives: [], label: "raw text" };
  };

  /**
   * `send`: the best text straight to the session. `prompt`: into the prompt you are looking at, only while it is
   * still the same session; with alternatives, the tabs above the prompt let you swap them in.
   */
  const deliver = async (sessionID: string, options: readonly string[], how: Delivery): Promise<boolean> => {
    if (how === "send") {
      await context.client.session.prompt({ sessionID, text: options[0]! });
      return true;
    }
    if (state.currentSession() !== sessionID) return false;
    const insertion = insertIntoComposer(context.renderer, options[0]!);
    if (!insertion) return false;
    tabs.show(sessionID, insertion, options);
    return true;
  };

  const finish = async (how: Delivery) => {
    const sessionID = target;
    const at = ui.startedAt;
    if (!sessionID) return setPhase("idle");
    setPhase("transcribing");
    try {
      const captured = await recorder.stop();
      if ("error" in captured) return failed(sessionID, at, Date.now() - at, REASON.noAudio, captured.error);
      const durationMs = Math.round(captured.seconds * 1000);
      if (captured.audioSeconds < MIN_SECONDS) {
        return failed(sessionID, at, durationMs, REASON.tooShort, `Only ${captured.audioSeconds.toFixed(1)} s of audio after trimming; whisper needs at least ${MIN_SECONDS} s.`);
      }
      const found = whisperModel();
      if ("error" in found) return failed(sessionID, at, durationMs, REASON.noModel, found.error);

      const heard = await transcribe(found.path, captured.file, languageFor(settings().language, found.model.english));
      // Whisper has read it: the audio is not needed for the cleanup call, so it goes now, not at the end.
      recorder.remove();
      if ("error" in heard) return failed(sessionID, at, durationMs, REASON.whisper, heard.error);
      if (!heard.text) return failed(sessionID, at, durationMs, REASON.noSpeech, "Whisper heard no speech in the recording.");

      const result = await normalize(sessionID, heard.text);
      const inserted = await deliver(sessionID, [result.text, ...result.alternatives], how);
      state.addRecording(sessionID, {
        at,
        durationMs,
        ok: true,
        label: result.label,
        text: result.text,
        alternatives: result.alternatives.length > 0 ? result.alternatives : undefined,
        raw: result.text === heard.text ? undefined : heard.text,
        inserted,
      });
    } catch (error) {
      logError("tui pipeline", error);
      failed(sessionID, at, Date.now() - at, REASON.error, (error as Error).message);
    } finally {
      recorder.remove();
      setPhase("idle");
    }
  };

  const download = async (id: string) => {
    const model = modelById(id);
    if (!model || ui.downloading) return;
    setUi((draft) => void (draft.downloading = id));
    toast(`Downloading ${model.label} (${model.size})…`);
    const result = await downloadModel(model, modelDirs(ui.options.modelsDir)[0]!);
    setUi((draft) => void (draft.downloading = ""));
    if ("error" in result) {
      logError(`download ${id}`, result.error);
      return toast(`Download failed: ${result.error}`, "error");
    }
    save("whisperModel", id);
    toast(`${model.label} downloaded and selected`, "success");
  };

  /** Puts a finished recording's text into the prompt, on request (a click or a key). */
  const insertRecording = (sessionID: string, id: string): boolean => {
    const recording = state.recordingsFor(sessionID).find((item) => item.id === id);
    if (!recording?.ok || !recording.text) return false;
    const insertion = state.currentSession() === sessionID ? insertIntoComposer(context.renderer, recording.text) : undefined;
    if (!insertion) {
      toast("Put the cursor in the prompt first, then try again", "warning");
      return false;
    }
    tabs.show(sessionID, insertion, [recording.text, ...(recording.alternatives ?? [])]);
    state.markInserted(sessionID, id);
    return true;
  };

  return {
    /** The record key: starts a recording, or stops it and puts the text in the prompt. */
    record: () => {
      if (ui.phase === "recording") return void finish("prompt");
      if (ui.phase === "idle") start();
    },
    /** Stops the recording and sends the transcript without editing. */
    submit: () => {
      if (ui.phase === "recording") void finish("send");
    },
    cancel: () => {
      if (ui.phase !== "recording") return;
      recorder.cancel();
      setPhase("idle");
    },
    download,
    insertRecording,
    dispose: () => {
      recorder.cancel();
      stopExitCleanup();
    },
  };
}

export type Pipeline = ReturnType<typeof createPipeline>;
