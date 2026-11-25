/**
 * Cleans up whisper transcripts with a model from the user's own OpenCode providers.
 *
 * Preferred path: a transient `session.generate` on the user's session. Nothing is added to history and the call
 * reports tokens and cost. Two hooks swap in the normalizer model and replace the system prompt. The answer is only
 * trusted when the `generate` hook saw this call's nonce.
 *
 * Fallback: `generate.text`, for sessions on another provider (`model.resolve` can't switch providers) and once the
 * session path has failed. It works with any configured model but reports no cost, so those calls count as unpriced.
 */
import type { CallUsage } from "../shared/cost.ts";
import { parseModel } from "../shared/options.ts";
import type { NormalizeInput, NormalizeReply } from "../shared/protocol.ts";
import { questionPrompt, splitAnswer } from "../shared/prompt.ts";
import { logError } from "../system/log.ts";

const NORMALIZE_TIMEOUT_MS = 30_000;
const TEXT_ATTEMPTS = 2;
/** Room for the summary line, and for up to three versions of the text. */
const MIN_TOKENS = 300;
const TOKENS_PER_CHAR = 2;
const MAX_TOKENS = 4096;

type ModelRef = { providerID: string; id: string };

interface Pending {
  sessionID: string;
  model: ModelRef;
  system: string;
  maxTokens: number;
  shaped: boolean;
  mismatch: boolean;
}

/**
 * The server runs one copy of the plugin per location and a new copy on every hot reload. Hooks run in the
 * session's copy while the TUI's RPC can land in another, so the state they share lives on globalThis.
 */
interface Shared {
  pending?: Map<string, Pending>;
  /** `session + normalizer provider` pairs where model.resolve can't switch providers. */
  textOnly?: Set<string>;
  broken?: boolean;
  counter?: number;
}

export interface Normalizer {
  normalize(input: NormalizeInput): Promise<NormalizeReply>;
  dispose(): Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const textOf = (message: any): string => {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("\n");
};

export async function createNormalizer(ctx: any, system: string): Promise<Normalizer> {
  const shared = ((globalThis as any).__opencodeStt ??= {}) as Shared;
  const pending = (shared.pending ??= new Map<string, Pending>());
  const textOnly = (shared.textOnly ??= new Set<string>());
  const pairKey = (sessionID: string, model: ModelRef) => `${sessionID}\u0000${model.providerID}`;

  const viaSession = async (
    sessionID: string,
    model: ModelRef,
    question: string,
    maxTokens: number,
  ): Promise<{ text: string; usage: CallUsage } | "unavailable"> => {
    shared.counter = (shared.counter ?? 0) + 1;
    const nonce = `st-${Date.now().toString(36)}-${shared.counter.toString(36)}`;
    const entry: Pending = { sessionID, model, system, maxTokens, shaped: false, mismatch: false };
    pending.set(nonce, entry);
    try {
      const result = await withTimeout<any>(ctx.session.generate({ sessionID, prompt: `${question}\n\n[stt ${nonce}]` }), NORMALIZE_TIMEOUT_MS);
      if (entry.mismatch) {
        textOnly.add(pairKey(sessionID, model));
        return "unavailable";
      }
      if (!entry.shaped) {
        shared.broken = true;
        logError("session.generate ran without the generate hook; using generate.text from now on");
        return "unavailable";
      }
      if (typeof result?.text !== "string") return "unavailable";
      return { text: result.text, usage: { cost: result.cost, tokens: result.tokens } };
    } catch (error) {
      logError("session.generate failed; falling back to generate.text", error);
      shared.broken = true;
      return "unavailable";
    } finally {
      pending.delete(nonce);
    }
  };

  const viaText = async (model: ModelRef, question: string): Promise<{ text: string } | undefined> => {
    const api = ctx.experimental?.generate?.text ? ctx.experimental.generate : ctx.generate;
    for (let attempt = 1; attempt <= TEXT_ATTEMPTS; attempt++) {
      try {
        const result = await withTimeout<any>(api.text({ prompt: `${system}\n\n${question}`, model }), NORMALIZE_TIMEOUT_MS);
        if (typeof result?.text === "string") return { text: result.text };
      } catch (error) {
        logError(`normalize attempt ${attempt} (generate.text)`, error);
      }
    }
    return undefined;
  };

  const normalize = async (input: NormalizeInput): Promise<NormalizeReply> => {
    const raw = typeof input?.text === "string" ? input.text.trim() : "";
    const model = parseModel(input?.model);
    if (!raw) return { error: "Nothing to normalize" };
    if (!model) return { error: "No normalizer model set" };
    const sessionID = typeof input.sessionID === "string" ? input.sessionID : undefined;
    const question = questionPrompt(raw, typeof input.title === "string" ? input.title : undefined);
    const maxTokens = Math.min(MAX_TOKENS, MIN_TOKENS + raw.length * TOKENS_PER_CHAR);

    let result: { text: string; usage?: CallUsage } | "unavailable" | undefined = "unavailable";
    if (sessionID && !shared.broken && !textOnly.has(pairKey(sessionID, model))) {
      result = await viaSession(sessionID, model, question, maxTokens);
    }
    if (result === "unavailable") result = await viaText(model, question);
    if (!result) return { error: "The normalizer model did not answer" };
    const { text, alternatives, summary } = splitAnswer(result.text);
    if (!text) return { error: "The normalizer model returned nothing" };
    return { text, alternatives, summary, usage: result.usage ?? null };
  };

  const resolveHook = await ctx.session.hook("experimental.model.resolve", (event: any) => {
    if (event.kind !== "generate") return;
    const entries = [...pending.values()].filter((entry) => entry.sessionID === event.sessionID);
    if (entries.length === 0) return;
    const model = entries[0]!.model;
    if (event.model?.providerID === model.providerID) {
      event.model = { providerID: model.providerID, id: model.id };
    } else {
      // Only models of the session's own provider can be swapped in.
      for (const entry of entries) entry.mismatch = true;
    }
  });

  const generateHook = await ctx.session.hook("generate", (event: any) => {
    if (pending.size === 0 || !Array.isArray(event.messages)) return;
    const last = event.messages.at(-1);
    const match = textOf(last).match(/\[stt (st-[a-z0-9]+-[a-z0-9]+)\]\s*$/);
    const entry = match ? pending.get(match[1]!) : undefined;
    if (!entry) return;
    // Only the transcript goes out: no session history, no tools.
    event.system = [{ type: "text", text: entry.system }];
    event.messages = [last];
    event.tools = {};
    event.options = { ...(event.options ?? {}), maxTokens: entry.mismatch ? 1 : entry.maxTokens };
    entry.shaped = true;
  });

  return {
    normalize,
    dispose: async () => {
      await Promise.allSettled([resolveHook.dispose(), generateHook.dispose()]);
    },
  };
}
