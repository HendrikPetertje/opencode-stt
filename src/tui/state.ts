/**
 * Everything the TUI half remembers, and the helpers every other TUI file needs: settings (durable, only what the
 * user changed), the per-session cost and recordings (durable), and transient state (recording phase, meter level,
 * spinner frame).
 */
import type { Plugin } from "@opencode/plugin/tui";
import { addTranscript, addUsage, emptyCost, prune, type CallUsage, type CostTotal } from "../shared/cost.ts";
import { parseOptions, type Options } from "../shared/options.ts";
import { newRecordingId, withInserted, withoutRecording, withRecording, type Recording } from "../shared/recording.ts";
import { changed, defaults, type Settings } from "../shared/settings.ts";
import { Stt } from "../rpc.ts";
import { logError } from "../system/log.ts";

export type Context = Plugin.Context;
export type Phase = "idle" | "recording" | "transcribing" | "normalizing";
export type Variant = "info" | "success" | "warning" | "error";

/** Sessions whose cost and recordings are remembered; the newest ones win. */
const MAX_SESSIONS = 200;
const CONFIG_RETRIES = 8;
const TICK_MS = 140;
/** The meter follows the voice up at once and falls back at this rate per update. */
const LEVEL_DECAY = 0.75;
const LEVEL_THROTTLE_MS = 60;

export function createState(context: Context) {
  // Transient, shared across hot reloads. The TUI does not receive plugin options: the server passes them over RPC.
  const [ui, setUi] = context.storage.memory("opencode-stt", {
    initial: {
      options: parseOptions(undefined) as Options,
      phase: "idle" as Phase,
      startedAt: 0,
      /** Meter value while recording, 0..1. */
      level: 0,
      frame: 0,
      sidebars: 0,
      /** Id of the whisper model being downloaded. */
      downloading: "",
      /** The options tabs above the prompt: how many, which one is in the prompt, and for which session. */
      tabs: { count: 0, index: 0, session: "" },
    },
  });
  // Durable: only what the user changed; everything else follows the plugin options.
  const [saved, updateSaved] = context.storage.store("settings", { initial: { overrides: {} as Partial<Settings> } });
  const [costs, updateCosts] = context.storage.store("cost", { initial: { sessions: {} as Record<string, CostTotal> } });
  const [history, updateHistory] = context.storage.store("recordings", { initial: { sessions: {} as Record<string, Recording[]> } });

  const rpc = () => context.client.rpc(Stt) as any;
  const location = () => context.location ?? context.data.location.default();

  const settings = (): Settings => ({ ...defaults(ui.options), ...saved.overrides });
  const save = (key: keyof Settings, value: Settings[keyof Settings]) =>
    void updateSaved((draft) => void ((draft.overrides as Record<string, unknown>)[key] = value));
  /** Forgets every change: settings follow the plugin options (or the built-in defaults) again. */
  const resetSettings = () => void updateSaved((draft) => void (draft.overrides = {}));
  const changedSettings = () => changed(settings(), defaults(ui.options));

  const currentSession = (): string | undefined => {
    const route = context.ui.router.current();
    return route?.type === "session" ? route.sessionID : undefined;
  };
  const rootOf = (sessionID: string): string => {
    try {
      return context.data.session.root(sessionID) || sessionID;
    } catch {
      return sessionID;
    }
  };

  /** Toasts are for what you just asked for (a download, a click that could not be done), never for background work. */
  const toast = (message: string, variant: Variant = "info") => context.ui.toast.show({ title: "Voice", message, variant, duration: 3000 });
  const setPhase = (phase: Phase) =>
    setUi((draft) => {
      draft.phase = phase;
      draft.level = 0;
      if (phase === "recording") draft.startedAt = Date.now();
    });

  /**
   * Milliseconds since the recording started. `Date.now()` is not reactive, so this also reads the frame the ticker
   * advances: anything showing it re-renders on every tick.
   */
  const elapsed = (): number => (ui.frame >= 0 ? Date.now() - ui.startedAt : 0);

  // ---------------------------------------------------------------- meter

  let lastLevelAt = 0;
  const pushLevel = (raw: number) => {
    const now = Date.now();
    if (now - lastLevelAt < LEVEL_THROTTLE_MS) return;
    lastLevelAt = now;
    setUi((draft) => void (draft.level = Math.max(raw, draft.level * LEVEL_DECAY)));
  };

  // ---------------------------------------------------------------- cost

  const costFor = (sessionID: string | undefined): CostTotal | undefined => (sessionID ? costs.sessions[rootOf(sessionID)] : undefined);
  const addCost = (sessionID: string, usage: "none" | CallUsage | undefined) =>
    void updateCosts((draft) => {
      const rootID = rootOf(sessionID);
      const total = draft.sessions[rootID] ?? emptyCost();
      const next = usage === "none" ? addTranscript(total) : addUsage(total, usage);
      // Delete first so the object's key order stays "least recently used first".
      delete draft.sessions[rootID];
      draft.sessions[rootID] = next;
      draft.sessions = prune(draft.sessions, MAX_SESSIONS);
    });

  // ---------------------------------------------------------------- recordings

  let counter = 0;
  /** Newest first. Subagent sessions share their parent's list. */
  const recordingsFor = (sessionID: string | undefined): readonly Recording[] => (sessionID ? history.sessions[rootOf(sessionID)] ?? [] : []);
  const addRecording = (sessionID: string, recording: Omit<Recording, "id">): Recording => {
    const full: Recording = { ...recording, id: newRecordingId(recording.at, counter++) };
    void updateHistory((draft) => {
      const rootID = rootOf(sessionID);
      const next = withRecording(draft.sessions[rootID] ?? [], full);
      delete draft.sessions[rootID];
      draft.sessions[rootID] = next;
      draft.sessions = prune(draft.sessions, MAX_SESSIONS);
    });
    return full;
  };
  const removeRecording = (sessionID: string, id: string) =>
    void updateHistory((draft) => {
      const rootID = rootOf(sessionID);
      if (draft.sessions[rootID]) draft.sessions[rootID] = withoutRecording(draft.sessions[rootID]!, id);
    });
  const markInserted = (sessionID: string, id: string) =>
    void updateHistory((draft) => {
      const rootID = rootOf(sessionID);
      if (draft.sessions[rootID]) draft.sessions[rootID] = withInserted(draft.sessions[rootID]!, id);
    });

  // ---------------------------------------------------------------- config

  /** The server registers its RPC a moment after the TUI starts, so ask a few times. */
  const loadConfig = async () => {
    for (let attempt = 0; attempt < CONFIG_RETRIES; attempt++) {
      try {
        const reply = (await rpc().config({}, { location: location() })) as Record<string, unknown>;
        setUi((draft) => void (draft.options = parseOptions(reply)));
        return;
      } catch (error) {
        if ((error as any)?.type !== "rpc.unavailable") return logError("tui config", error);
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  };

  const ticker = setInterval(() => {
    if (ui.phase !== "idle") setUi((draft) => void (draft.frame = (draft.frame + 1) % 600));
  }, TICK_MS);

  return {
    context,
    ui,
    setUi,
    settings,
    save,
    resetSettings,
    changedSettings,
    rpc,
    location,
    currentSession,
    rootOf,
    toast,
    setPhase,
    elapsed,
    pushLevel,
    costFor,
    addCost,
    recordingsFor,
    addRecording,
    removeRecording,
    markInserted,
    loadConfig,
    stop: () => clearInterval(ticker),
  };
}

export type State = ReturnType<typeof createState>;
