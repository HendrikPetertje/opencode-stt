import { describe, expect, test } from "bun:test";
import { parseModel, parseOptions } from "./options.ts";

describe("options", () => {
  test("defaults", () => {
    expect(parseOptions(undefined)).toMatchObject({
      whisperModel: "base.en",
      language: "en",
      normalize: true,
      trimSilence: true,
      keybind: "<leader>v",
      recordKeybind: "ctrl+r",
      submitKeybind: "<leader>r",
    });
    expect(parseOptions(undefined).model).toBeUndefined();
  });

  test("model must be provider/model", () => {
    expect(parseOptions({ model: "github-copilot/claude-haiku-5.5" }).model).toBe("github-copilot/claude-haiku-5.5");
    expect(parseOptions({ model: "haiku" }).model).toBeUndefined();
    expect(parseModel("openrouter/anthropic/claude-haiku")).toEqual({ providerID: "openrouter", id: "anthropic/claude-haiku" });
    expect(parseModel("/x")).toBeUndefined();
    expect(parseModel("x/")).toBeUndefined();
  });

  test("overrides", () => {
    expect(parseOptions({ normalize: false, trimSilence: false, whisperModel: "small.en", language: "nl" })).toMatchObject({
      normalize: false,
      trimSilence: false,
      whisperModel: "small.en",
      language: "nl",
    });
  });
});
