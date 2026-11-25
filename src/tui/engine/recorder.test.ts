import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeOnExit, sweepStale } from "./recorder.ts";

describe("sweepStale", () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "stt-sweep-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const touch = (name: string) => writeFileSync(join(dir, name), "x");

  test("removes wavs of processes that are gone", () => {
    touch("opencode-stt-999991.wav");
    expect(sweepStale(dir, () => false)).toBe(1);
    expect(existsSync(join(dir, "opencode-stt-999991.wav"))).toBe(false);
  });

  test("leaves the wav of a process that is still running", () => {
    touch("opencode-stt-999992.wav");
    expect(sweepStale(dir, (pid) => pid === 999992)).toBe(0);
    expect(existsSync(join(dir, "opencode-stt-999992.wav"))).toBe(true);
  });

  test("leaves our own wav and files that are not ours", () => {
    touch(`opencode-stt-${process.pid}.wav`);
    touch("other.wav");
    touch("opencode-stt-abc.wav");
    touch("opencode-stt-123.wav.part");
    expect(sweepStale(dir, () => false)).toBe(0);
  });

  test("a missing folder is fine", () => {
    expect(sweepStale(join(dir, "nope"), () => false)).toBe(0);
  });
});

describe("removeOnExit", () => {
  /** Runs `body` in a separate process that registers the hook, writes the wav, then exits. */
  const run = (file: string, body: string) => {
    const script = `
      import { writeFileSync } from "node:fs";
      import { removeOnExit } from ${JSON.stringify(`${import.meta.dir}/recorder.ts`)};
      writeFileSync(${JSON.stringify(file)}, "audio");
      ${body.replaceAll("FILE", JSON.stringify(file))}
      process.exit(0);
    `;
    return Bun.spawnSync(["bun", "-e", script]);
  };

  test("a process that exits normally leaves no wav behind", () => {
    const dir = mkdtempSync(join(tmpdir(), "stt-exit-"));
    const file = join(dir, "opencode-stt-1.wav");
    try {
      expect(run(file, "removeOnExit(FILE);").exitCode).toBe(0);
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the returned function takes the hook off again, so the file stays", () => {
    const dir = mkdtempSync(join(tmpdir(), "stt-exit-"));
    const file = join(dir, "opencode-stt-2.wav");
    try {
      run(file, "removeOnExit(FILE)();");
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
