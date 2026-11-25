/**
 * Keeps the folder structure honest (see OUTLINE.md): which code may import which, so the server half and the TUI
 * half stay apart. Only relative imports and package names are checked, tests are skipped.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = ["index.ts", "tui.tsx", ...walk(join(root, "src")).map((file) => relative(root, file))];

interface Import {
  from: string;
  spec: string;
  /** The imported file for relative imports, relative to the plugin root. */
  target?: string;
}

const IMPORT = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importsOf(file: string): Import[] {
  const source = readFileSync(join(root, file), "utf8");
  return [...source.matchAll(IMPORT)].map((match) => {
    const spec = match[1]!;
    return { from: file, spec, target: spec.startsWith(".") ? relative(root, resolve(root, dirname(file), spec)) : undefined };
  });
}

const all = files.flatMap(importsOf);
const under = (path: string | undefined, prefix: string) => !!path && (path === prefix || path.startsWith(`${prefix}/`));
const offenders = (list: Import[]) => list.map((item) => `${item.from} imports ${item.spec}`);

const shared = (file: string) => under(file, "src/shared");
const system = (file: string) => under(file, "src/system");
const server = (file: string) => file === "index.ts" || under(file, "src/server");
const tui = (file: string) => file === "tui.tsx" || under(file, "src/tui");
const engine = (file: string) => under(file, "src/tui/engine");
const ui = (file: string) => under(file, "src/tui/ui");

const UI_PACKAGE = /^(solid-js|@opentui|@opencode\/plugin\/tui)/;
const OPENCODE_PACKAGE = /^@opencode/;

describe("architecture", () => {
  test("every source file lives in a known place", () => {
    const strays = files.filter(
      (file) => !["index.ts", "tui.tsx", "src/rpc.ts"].includes(file) && !["src/shared", "src/system", "src/server", "src/tui"].some((dir) => under(file, dir)),
    );
    expect(strays).toEqual([]);
  });

  test("src/shared is pure: no Node, UI or OpenCode code, only itself", () => {
    const bad = all.filter((i) => shared(i.from) && (/^(node:|bun:)/.test(i.spec) || UI_PACKAGE.test(i.spec) || OPENCODE_PACKAGE.test(i.spec) || (i.target !== undefined && !under(i.target, "src/shared"))));
    expect(offenders(bad)).toEqual([]);
  });

  test("src/system only uses Node and itself", () => {
    const bad = all.filter((i) => system(i.from) && (UI_PACKAGE.test(i.spec) || OPENCODE_PACKAGE.test(i.spec) || (i.target !== undefined && !under(i.target, "src/system"))));
    expect(offenders(bad)).toEqual([]);
  });

  test("the server half never reaches into the TUI", () => {
    const bad = all.filter((i) => server(i.from) && (under(i.target, "src/tui") || i.target === "tui.tsx" || UI_PACKAGE.test(i.spec) || i.target?.endsWith(".tsx")));
    expect(offenders(bad)).toEqual([]);
  });

  test("the TUI half never reaches into the server", () => {
    const bad = all.filter((i) => tui(i.from) && (under(i.target, "src/server") || i.target === "index.ts" || i.spec === "@opencode/plugin" || i.spec === "@opencode/plugin/rpc"));
    expect(offenders(bad)).toEqual([]);
  });

  test("the engine (sox, whisper-cli, curl) has no UI and does not know the rest of the TUI", () => {
    const bad = all.filter(
      (i) =>
        engine(i.from) &&
        (UI_PACKAGE.test(i.spec) ||
          OPENCODE_PACKAGE.test(i.spec) ||
          i.target?.endsWith(".tsx") ||
          (i.target !== undefined && !(under(i.target, "src/tui/engine") || under(i.target, "src/shared") || under(i.target, "src/system")))),
    );
    expect(offenders(bad)).toEqual([]);
  });

  test("components only draw: they never touch the engine's processes", () => {
    const processes = ["src/tui/engine/recorder.ts", "src/tui/engine/transcribe.ts", "src/tui/engine/download.ts"];
    const bad = all.filter((i) => ui(i.from) && (processes.includes(i.target ?? "") || /^node:child_process$/.test(i.spec)));
    expect(offenders(bad)).toEqual([]);
  });

  test("the RPC contract imports nothing but the RPC helper", () => {
    const bad = all.filter((i) => i.from === "src/rpc.ts" && i.spec !== "@opencode/plugin/rpc");
    expect(offenders(bad)).toEqual([]);
  });

  test("only the server half and the contract use the server plugin API", () => {
    const bad = all.filter((i) => (i.spec === "@opencode/plugin" || i.spec === "@opencode/plugin/rpc") && !(server(i.from) || i.from === "src/rpc.ts"));
    expect(offenders(bad)).toEqual([]);
  });
});
