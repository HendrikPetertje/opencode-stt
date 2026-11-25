import { describe, expect, test } from "bun:test";
import { addTranscript, addUsage, emptyCost } from "./cost.ts";
import { clip, clock, costLine, meterBar, timeOfDay } from "./format.ts";

describe("format", () => {
  test("clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(7_400)).toBe("0:07");
    expect(clock(723_000)).toBe("12:03");
    expect(clock(-5)).toBe("0:00");
  });

  test("cost line of a session without transcripts", () => {
    expect(costLine(undefined)).toBe("$0.00 · 0 transcripts");
  });

  test("cost line with a priced and an unpriced call", () => {
    let total = addUsage(emptyCost(), { cost: 0.0021, tokens: { input: 900, output: 100 } });
    total = addUsage(total, undefined);
    expect(costLine(total)).toBe("$0.0021+ · 2 transcripts · 1.0k tokens · 1 unpriced");
  });

  test("a single free transcript is singular", () => {
    expect(costLine(addTranscript(emptyCost()))).toBe("$0.00 · 1 transcript");
  });

  test("time of day is hh:mm:ss, zero padded", () => {
    expect(timeOfDay(new Date(2026, 10, 24, 9, 5, 3).getTime())).toBe("09:05:03");
    expect(timeOfDay(new Date(2026, 10, 24, 23, 59, 59).getTime())).toBe("23:59:59");
  });

  test("clip flattens whitespace and adds an ellipsis", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("a  b\nc", 10)).toBe("a b c");
    expect(clip("0123456789", 5)).toBe("0123…");
  });

  test("the meter bar is always as wide as asked and only grows to the right", () => {
    for (const level of [0, 0.01, 0.25, 0.5, 0.77, 1]) {
      const { filled, empty } = meterBar(level, 10);
      expect([...filled].length + [...empty].length).toBe(10);
      expect(filled.replace(/[█▏▎▍▌▋▊▉]/g, "")).toBe("");
      expect(empty.replace(/·/g, "")).toBe("");
    }
  });

  test("meter bar extremes and a partial block", () => {
    expect(meterBar(0, 4)).toEqual({ filled: "", empty: "····" });
    expect(meterBar(1, 4)).toEqual({ filled: "████", empty: "" });
    // 0.5 of 4 cells = 16 eighths = 2 full blocks; 0.375 of 4 cells = 12 eighths = 1 block and a half
    expect(meterBar(0.5, 4)).toEqual({ filled: "██", empty: "··" });
    expect(meterBar(0.375, 4)).toEqual({ filled: "█▌", empty: "··" });
  });

  test("a louder level never gives a shorter bar, and bad input is empty", () => {
    const length = (level: number) => [...meterBar(level, 10).filled].length;
    expect(length(0.2)).toBeLessThanOrEqual(length(0.6));
    expect(meterBar(Number.NaN, 5).filled).toBe("");
    expect(meterBar(7, 3).filled).toBe("███");
  });
});
