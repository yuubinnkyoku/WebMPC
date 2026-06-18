import { describe, expect, it } from "vitest";
import { shouldIgnorePadKeyboardEventTarget } from "./keyboardTarget";

describe("pad keyboard event targets", () => {
  it("ignores form controls and buttons", () => {
    expect(shouldIgnorePadKeyboardEventTarget({ tagName: "INPUT" })).toBe(true);
    expect(shouldIgnorePadKeyboardEventTarget({ tagName: "select" })).toBe(true);
    expect(shouldIgnorePadKeyboardEventTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(shouldIgnorePadKeyboardEventTarget({ tagName: "BUTTON" })).toBe(true);
  });

  it("ignores contenteditable targets", () => {
    expect(shouldIgnorePadKeyboardEventTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("allows ordinary document targets", () => {
    expect(shouldIgnorePadKeyboardEventTarget(null)).toBe(false);
    expect(shouldIgnorePadKeyboardEventTarget({ tagName: "DIV" })).toBe(false);
    expect(shouldIgnorePadKeyboardEventTarget({})).toBe(false);
  });
});
