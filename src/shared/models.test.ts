import { describe, expect, test } from "bun:test";
import { findModel, modelById, modelUrl, WHISPER_MODELS } from "./models.ts";

describe("whisper models", () => {
  test("ids and files are unique and ggml named", () => {
    expect(new Set(WHISPER_MODELS.map((model) => model.id)).size).toBe(WHISPER_MODELS.length);
    for (const model of WHISPER_MODELS) expect(model.file).toBe(`ggml-${model.id}.bin`);
  });

  test("english flag follows the .en suffix", () => {
    for (const model of WHISPER_MODELS) expect(model.english).toBe(model.id.endsWith(".en"));
  });

  test("lookup and url", () => {
    expect(modelById("base.en")?.file).toBe("ggml-base.en.bin");
    expect(modelById("nope")).toBeUndefined();
    expect(modelUrl("ggml-base.en.bin")).toBe("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin");
  });

  test("findModel returns the first folder that has the file", () => {
    const model = modelById("base.en")!;
    const dirs = ["/a", "/b"];
    expect(findModel(model, dirs, (path) => path === "/b/ggml-base.en.bin")).toBe("/b/ggml-base.en.bin");
    expect(findModel(model, dirs, () => false)).toBeUndefined();
  });
});
