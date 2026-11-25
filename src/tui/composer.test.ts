import { describe, expect, test } from "bun:test";
import { insertIntoComposer, locate } from "./composer.ts";

/** A text input that behaves like the prompt textarea: insert at the cursor, replace everything. */
class FakeInput {
  plainText: string;
  cursorOffset: number;
  constructor(text = "", cursor = text.length) {
    this.plainText = text;
    this.cursorOffset = cursor;
  }
  insertText(text: string) {
    this.plainText = this.plainText.slice(0, this.cursorOffset) + text + this.plainText.slice(this.cursorOffset);
    this.cursorOffset += text.length;
  }
  setText(text: string) {
    this.plainText = text;
    this.cursorOffset = 0;
  }
}

const renderer = (focused: unknown) => ({ currentFocusedRenderable: focused });

describe("insertIntoComposer", () => {
  test("nothing editable focused", () => {
    expect(insertIntoComposer(renderer(null), "hi")).toBeUndefined();
    expect(insertIntoComposer(renderer({}), "hi")).toBeUndefined();
    expect(insertIntoComposer(undefined, "hi")).toBeUndefined();
  });

  test("inserts into an empty prompt", () => {
    const input = new FakeInput();
    expect(insertIntoComposer(renderer(input), "fix the bug")).toBeDefined();
    expect(input.plainText).toBe("fix the bug");
  });

  test("a separator between existing text and the insertion", () => {
    const input = new FakeInput("look at main.ts");
    insertIntoComposer(renderer(input), "and fix it");
    expect(input.plainText).toBe("look at main.ts and fix it");
  });

  test("blank text is not inserted", () => {
    const input = new FakeInput("abc");
    expect(insertIntoComposer(renderer(input), "  ")).toBeUndefined();
    expect(input.plainText).toBe("abc");
  });

  test("replace swaps the inserted text and leaves the rest", () => {
    const input = new FakeInput("look at main.ts");
    const insertion = insertIntoComposer(renderer(input), "and fix it")!;
    expect(insertion.replace("and delete it")).toBe(true);
    expect(input.plainText).toBe("look at main.ts and delete it");
    expect(insertion.replace("and test it")).toBe(true);
    expect(input.plainText).toBe("look at main.ts and test it");
    expect(insertion.intact()).toBe(true);
  });

  test("replace in an empty prompt keeps no separator", () => {
    const input = new FakeInput();
    const insertion = insertIntoComposer(renderer(input), "first")!;
    insertion.replace("second");
    expect(input.plainText).toBe("second");
  });

  test("replace works when the cursor was in the middle of the prompt", () => {
    const input = new FakeInput("before after", 6);
    const insertion = insertIntoComposer(renderer(input), "middle")!;
    expect(input.plainText).toBe("before middle after");
    insertion.replace("centre");
    expect(input.plainText).toBe("before centre after");
  });

  test("the cursor goes after the swapped text", () => {
    const input = new FakeInput("a");
    const insertion = insertIntoComposer(renderer(input), "bcd")!;
    insertion.replace("xy");
    expect(input.cursorOffset).toBe("a xy".length);
  });

  test("any edit makes the insertion not intact and blocks replacing", () => {
    const input = new FakeInput();
    const insertion = insertIntoComposer(renderer(input), "hello")!;
    expect(insertion.intact()).toBe(true);
    input.plainText += "!";
    expect(insertion.intact()).toBe(false);
    expect(insertion.replace("other")).toBe(false);
    expect(input.plainText).toBe("hello!");
  });

  test("a cleared prompt (submitted or ctrl+c) is not intact", () => {
    const input = new FakeInput();
    const insertion = insertIntoComposer(renderer(input), "hello")!;
    input.plainText = "";
    expect(insertion.intact()).toBe(false);
  });

  test("an input without setText still accepts the insertion but cannot swap", () => {
    const input: any = { plainText: "", insertText(text: string) { this.plainText += text; } };
    const insertion = insertIntoComposer(renderer(input), "hello")!;
    expect(insertion.replace("other")).toBe(false);
    expect(input.plainText).toBe("hello");
  });
});

describe("locate", () => {
  test("uses the cursor when it fits", () => {
    expect(locate("ab", "a-b", "-", 1)).toBe(1);
  });

  test("falls back to the common prefix", () => {
    expect(locate("ab", "a-b", "-")).toBe(1);
  });

  test("copes with an insertion that starts like the text after it", () => {
    // " middle" goes in at 6, but "before " is also a common prefix
    expect(locate("before after", "before middle after", " middle")).toBe(6);
  });

  test("gives up when the text does not fit", () => {
    expect(locate("abc", "xyz", "q")).toBeUndefined();
  });
});
