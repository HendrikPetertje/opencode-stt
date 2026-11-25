import { describe, expect, test } from "bun:test";
import { joinPrompt } from "./text.ts";

describe("joinPrompt", () => {
  test("an empty prompt gets the text as is", () => {
    expect(joinPrompt("", "fix the bug")).toBe("fix the bug");
  });

  test("text after text gets a space", () => {
    expect(joinPrompt("look at main.ts", "and fix it")).toBe(" and fix it");
  });

  test("no double space after whitespace", () => {
    expect(joinPrompt("look at main.ts ", "and fix it")).toBe("and fix it");
    expect(joinPrompt("line\n", "next")).toBe("next");
  });

  test("blank text adds nothing", () => {
    expect(joinPrompt("abc", "  \n")).toBe("");
  });
});
