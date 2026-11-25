import { describe, expect, test } from "bun:test";
import { cleanTranscript, languageError, languageFor, whisperArgs } from "./whisper.ts";

describe("whisper-cli", () => {
  test("arguments", () => {
    expect(whisperArgs("/m.bin", "/a.wav", "en")).toEqual(["-m", "/m.bin", "-f", "/a.wav", "-l", "en", "-np", "-nt"]);
  });

  test("english-only models always use english", () => {
    expect(languageFor("nl", true)).toBe("en");
    expect(languageFor("nl", false)).toBe("nl");
    expect(languageFor("", false)).toBe("auto");
  });

  test("annotations and whitespace are removed", () => {
    expect(cleanTranscript(" [BLANK_AUDIO]\n")).toBe("");
    expect(cleanTranscript("[ Silence ] fix the (music) bug\n in main")).toBe("fix the bug in main");
  });

  test("unknown language", () => {
    expect(languageError("error: unknown language 'xx'")).toBe("Unknown whisper language: xx");
    expect(languageError("fine")).toBeUndefined();
  });
});
