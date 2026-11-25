import { describe, expect, test } from "bun:test";
import { ALTERNATIVE_MARKER, cleanAnswer, DEFAULT_SYSTEM_PROMPT, MAX_ALTERNATIVES, questionPrompt, splitAnswer, systemPrompt } from "./prompt.ts";

describe("prompt", () => {
  test("custom prompt replaces the default", () => {
    expect(systemPrompt(undefined)).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(systemPrompt("  ")).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(systemPrompt("mine")).toBe("mine");
  });

  test("the question carries the title and the text", () => {
    expect(questionPrompt("hello", "Fix login")).toContain("Session title: Fix login");
    expect(questionPrompt("hello", undefined)).not.toContain("Session title");
    expect(questionPrompt("hello", undefined)).toContain("hello");
  });

  test("answers lose fences and wrapping quotes only", () => {
    expect(cleanAnswer("  Fix the bug.  ")).toBe("Fix the bug.");
    expect(cleanAnswer("```\nFix the bug.\n```")).toBe("Fix the bug.");
    expect(cleanAnswer('"Fix the bug."')).toBe("Fix the bug.");
    expect(cleanAnswer('He said "stop" and "go"')).toBe('He said "stop" and "go"');
    expect(cleanAnswer('"a" and "b"')).toBe('"a" and "b"');
  });

  test("the question asks for a summary line", () => {
    expect(questionPrompt("hello", undefined)).toContain("SUMMARY:");
  });
});

describe("splitAnswer", () => {
  test("text and a summary on the last line", () => {
    expect(splitAnswer("Fix the login bug.\nSUMMARY: fix login")).toEqual({ text: "Fix the login bug.", alternatives: [], summary: "fix login" });
  });

  test("the summary is cut to two words and loses punctuation", () => {
    expect(splitAnswer("Do it.\nSUMMARY: **Refactor the auth module.**").summary).toBe("Refactor the");
    expect(splitAnswer('Do it.\nSUMMARY: "deploy"').summary).toBe("deploy");
  });

  test("no summary line leaves the text alone", () => {
    expect(splitAnswer("Just the text.")).toEqual({ text: "Just the text.", alternatives: [], summary: undefined });
  });

  test("an empty summary is no summary", () => {
    expect(splitAnswer("Text.\nSUMMARY:   ")).toEqual({ text: "Text.", alternatives: [], summary: undefined });
  });

  test("a code fence around everything is removed first", () => {
    expect(splitAnswer("```\nFix it.\nSUMMARY: fix\n```")).toEqual({ text: "Fix it.", alternatives: [], summary: "fix" });
  });

  test("multi-line text keeps its lines", () => {
    expect(splitAnswer("Line one.\nLine two.\nSUMMARY: two lines").text).toBe("Line one.\nLine two.");
  });
});

describe("alternatives", () => {
  const marker = ALTERNATIVE_MARKER;

  test("the best text, two alternatives and a summary", () => {
    const answer = splitAnswer(`Restart the node service.\n${marker}\nRestart the note service.\n${marker}\nRestart the no service.\nSUMMARY: restart service`);
    expect(answer).toEqual({
      text: "Restart the node service.",
      alternatives: ["Restart the note service.", "Restart the no service."],
      summary: "restart service",
    });
  });

  test("no more than the allowed number of alternatives", () => {
    const parts = ["best", "one", "two", "three", "four"].join(`\n${marker}\n`);
    expect(splitAnswer(parts).alternatives).toHaveLength(MAX_ALTERNATIVES);
  });

  test("an alternative that only differs in case or punctuation is dropped", () => {
    const answer = splitAnswer(`Fix the bug.\n${marker}\nfix the bug\n${marker}\nFix the  bug!`);
    expect(answer.alternatives).toEqual([]);
  });

  test("duplicate alternatives are kept once, empty ones are dropped", () => {
    const answer = splitAnswer(`A b.\n${marker}\nC d.\n${marker}\nC D\n${marker}\n`);
    expect(answer.alternatives).toEqual(["C d."]);
  });

  test("alternatives with a multi-line best text", () => {
    const answer = splitAnswer(`Line one.\nLine two.\n${marker}\nLine one.\nLine 2.\nSUMMARY: lines`);
    expect(answer.text).toBe("Line one.\nLine two.");
    expect(answer.alternatives).toEqual(["Line one.\nLine 2."]);
    expect(answer.summary).toBe("lines");
  });

  test("the question explains the marker", () => {
    expect(questionPrompt("x", undefined)).toContain(marker);
  });
});
