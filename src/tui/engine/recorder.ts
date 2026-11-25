import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { levelOf, outputArgs, pcmRms, recordArgs, seconds, trimOffset, wavBytes, type Backend, type Chunk } from "../../shared/audio.ts";

export interface StartOptions {
  backend: Backend;
  mic?: string;
  trimSilence: boolean;
  /** 0..1 meter value, about ten times a second. */
  onLevel: (level: number) => void;
  /** Called when sox dies on its own (permission denied, device gone). */
  onFailure: (message: string) => void;
}

export type Captured = { file: string; seconds: number; audioSeconds: number } | { error: string; reason: "no audio" };

/**
 * One sox process at a time. sox streams raw samples; this class measures the level for the meter, trims leading
 * silence, and writes a private wav that is removed after use. Audio is kept in memory only until it is written.
 */
export class Recorder {
  private proc: ChildProcess | undefined;
  private stderr = "";
  private stopping = false;
  private trim = true;
  private parts: Uint8Array[] = [];
  private chunks: Chunk[] = [];
  /** A sample can be split over two reads; its first byte waits here. */
  private carry: number | undefined;
  readonly file = join(tmpdir(), `opencode-stt-${process.pid}.wav`);

  get active(): boolean {
    return this.proc !== undefined;
  }

  start(options: StartOptions): void {
    if (this.proc) return;
    this.remove();
    this.parts = [];
    this.chunks = [];
    this.carry = undefined;
    this.stderr = "";
    this.stopping = false;
    this.trim = options.trimSilence;
    const proc = spawn("sox", [...recordArgs(options.backend, options.mic), ...outputArgs()], { stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;
    proc.stdout?.on("data", (data: Buffer) => this.take(data, options.onLevel));
    proc.stderr?.on("data", (data) => void (this.stderr += data.toString()));
    proc.on("error", (error) => {
      this.proc = undefined;
      options.onFailure((error as NodeJS.ErrnoException).code === "ENOENT" ? "sox not found: brew install sox" : `Recording failed: ${error.message}`);
    });
    proc.on("exit", (code) => {
      if (this.proc === proc) this.proc = undefined;
      if (this.stopping || code === 0 || code === null) return;
      options.onFailure(`Recording error: ${this.stderr.trim().split("\n").pop() || `sox exited (${code})`}`);
    });
  }

  private take(data: Buffer, onLevel: (level: number) => void): void {
    let bytes: Uint8Array = data;
    if (this.carry !== undefined) {
      bytes = Buffer.concat([Buffer.from([this.carry]), data]);
      this.carry = undefined;
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes[bytes.length - 1];
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    if (bytes.length === 0) return;
    const rms = pcmRms(bytes);
    this.parts.push(bytes);
    this.chunks.push({ bytes: bytes.length, rms });
    onLevel(levelOf(rms));
  }

  /** Stops sox, then writes what was captured to `file`. */
  async stop(): Promise<Captured> {
    const proc = this.proc;
    if (proc) {
      this.stopping = true;
      const exited = new Promise<void>((resolve) => proc.once("close", () => resolve()));
      proc.kill("SIGINT");
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
      if (proc.exitCode === null) proc.kill("SIGKILL");
      this.proc = undefined;
    }
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
    if (total === 0) return { error: "No audio was captured: sox may have failed to open the microphone", reason: "no audio" };
    const pcm = Buffer.concat(this.parts);
    const from = this.trim ? trimOffset(this.chunks) : 0;
    writeFileSync(this.file, wavBytes(pcm.subarray(from)), { mode: 0o600 });
    this.parts = [];
    this.chunks = [];
    return { file: this.file, seconds: seconds(total), audioSeconds: seconds(total - from) };
  }

  cancel(): void {
    this.stopping = true;
    this.proc?.kill("SIGKILL");
    this.proc = undefined;
    this.parts = [];
    this.chunks = [];
    this.remove();
  }

  /** Deletes the wav; recordings never stay on disk. */
  remove(): void {
    rmSync(this.file, { force: true });
  }
}

const WAV_NAME = /^opencode-stt-(\d+)\.wav$/;

/** Whether a process with this id is running (EPERM means it is, but not ours). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Deletes wavs left behind by an OpenCode that was killed between writing the recording and deleting it. The name
 * carries the process id, so a wav of a process that is still running (another OpenCode) is left alone.
 */
export function sweepStale(dir: string = tmpdir(), alive: (pid: number) => boolean = isAlive): number {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      const pid = Number(WAV_NAME.exec(name)?.[1]);
      if (!pid || pid === process.pid || alive(pid)) continue;
      rmSync(join(dir, name), { force: true });
      removed++;
    }
  } catch {}
  return removed;
}

/**
 * Deletes `file` when this process exits (a normal quit, `process.exit`, the end of the event loop). It runs
 * synchronously, as exit handlers must. Signals are deliberately not hooked: a signal handler stops the process from
 * dying on that signal unless it re-raises it, which could get in the way of OpenCode's own exit handling. What a
 * kill leaves behind is removed by `sweepStale` at the next start. Returns a function that removes the hook again.
 */
export function removeOnExit(file: string): () => void {
  const remove = () => rmSync(file, { force: true });
  process.on("exit", remove);
  return () => void process.off("exit", remove);
}
