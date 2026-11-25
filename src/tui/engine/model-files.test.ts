import { describe, expect, test } from "bun:test";
import { modelDirs } from "./model-files.ts";

describe("model folders", () => {
  test("a custom models folder comes first", () => {
    expect(modelDirs("/models")[0]).toBe("/models");
    expect(modelDirs()[0]).toMatch(/\.local\/share\/whisper-cpp$/);
  });

  test("the homebrew folders are searched after it", () => {
    expect(modelDirs("/models").slice(1)).toEqual(["/opt/homebrew/share/whisper-cpp/models", "/usr/local/share/whisper-cpp/models"]);
  });
});
