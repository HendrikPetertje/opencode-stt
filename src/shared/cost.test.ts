import { describe, expect, test } from "bun:test";
import { addTranscript, addUsage, emptyCost, formatTokens, formatUsd, prune } from "./cost.ts";

describe("cost", () => {
  test("a priced call adds cost, tokens and a transcript", () => {
    const total = addUsage(emptyCost(), { cost: 0.002, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 10, write: 0 } } });
    expect(total).toMatchObject({ usd: 0.002, transcripts: 1, calls: 1, unpriced: 0, input: 100, output: 25, cacheRead: 10 });
    expect(formatUsd(total)).toBe("$0.0020");
  });

  test("a call without a price is unpriced and the total gets a +", () => {
    const total = addUsage(emptyCost(), undefined);
    expect(total.unpriced).toBe(1);
    expect(formatUsd(total)).toBe("$0.00+");
  });

  test("a transcript without normalization is free", () => {
    const total = addTranscript(emptyCost());
    expect(total).toMatchObject({ usd: 0, transcripts: 1, calls: 0, unpriced: 0 });
    expect(formatUsd(total)).toBe("$0.00");
  });

  test("tokens", () => {
    expect(formatTokens({ ...emptyCost(), input: 80, output: 20 })).toBe("100 tokens");
    expect(formatTokens({ ...emptyCost(), input: 1000, output: 500 })).toBe("1.5k tokens");
  });

  test("prune keeps the newest sessions", () => {
    expect(Object.keys(prune({ a: 1, b: 2, c: 3 }, 2))).toEqual(["b", "c"]);
    const small = { a: 1 };
    expect(prune(small, 2)).toBe(small);
  });
});
