import { describe, expect, test } from "bun:test";
import { ACTIONS, changed, defaults, PICKERS, ROWS, toggle } from "./settings.ts";
import { parseOptions } from "./options.ts";

describe("settings", () => {
  test("defaults follow the options", () => {
    const settings = defaults(parseOptions({ model: "p/m", whisperModel: "small.en", normalize: false }));
    expect(settings).toMatchObject({ model: "p/m", whisperModel: "small.en", normalize: false, mic: "", trimSilence: true });
  });

  test("every row is an action, a picker or a toggle", () => {
    for (const row of ROWS.filter((row) => !ACTIONS.has(row.key))) {
      const base = defaults(parseOptions(undefined));
      const changed = toggle(base, row.key, "toggle");
      expect(PICKERS.has(row.key) ? changed === base : changed !== base).toBe(true);
    }
  });

  test("changed lists what differs from the defaults", () => {
    const base = defaults(parseOptions({ model: "p/m" }));
    expect(changed(base, base)).toEqual([]);
    expect(changed({ ...base, mic: "USB", normalize: false }, base).sort()).toEqual(["mic", "normalize"]);
    // a value set back to the default no longer counts
    expect(changed({ ...base, model: "p/m" }, base)).toEqual([]);
  });

  test("reset is the only action and no picker", () => {
    expect([...ACTIONS]).toEqual(["reset"]);
    expect(PICKERS.has("reset")).toBe(false);
  });

  test("h and l set a toggle explicitly", () => {
    const base = defaults(parseOptions(undefined));
    expect(toggle(base, "normalize", "left").normalize).toBe(false);
    expect(toggle(base, "normalize", "right").normalize).toBe(true);
  });
});
