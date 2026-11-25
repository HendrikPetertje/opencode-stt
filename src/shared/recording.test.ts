import { describe, expect, test } from "bun:test";
import { MAX_RECORDINGS, newRecordingId, withInserted, withoutRecording, withRecording, type Recording } from "./recording.ts";

const make = (id: string, extra: Partial<Recording> = {}): Recording => ({ id, at: 0, durationMs: 1000, ok: true, label: "success", ...extra });

describe("recordings", () => {
  test("the newest goes first", () => {
    expect(withRecording([make("a")], make("b")).map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("the list is capped and keeps the newest", () => {
    let list: Recording[] = [];
    for (let i = 0; i < MAX_RECORDINGS + 5; i++) list = withRecording(list, make(String(i)));
    expect(list).toHaveLength(MAX_RECORDINGS);
    expect(list[0]!.id).toBe(String(MAX_RECORDINGS + 4));
  });

  test("adding the same id again replaces it instead of duplicating", () => {
    const list = withRecording([make("a", { label: "old" })], make("a", { label: "new" }));
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe("new");
  });

  test("remove and mark inserted", () => {
    const list = [make("a"), make("b")];
    expect(withoutRecording(list, "a").map((r) => r.id)).toEqual(["b"]);
    expect(withInserted(list, "b").map((r) => r.inserted)).toEqual([undefined, true]);
    expect(withoutRecording(list, "zzz")).toHaveLength(2);
  });

  test("ids differ for the same millisecond", () => {
    expect(newRecordingId(1000, 0)).not.toBe(newRecordingId(1000, 1));
  });
});
