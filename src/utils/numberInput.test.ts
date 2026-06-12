import { describe, expect, it } from "vitest";
import { parseOptionalNumberInput, parseRequiredNumberInput } from "./numberInput";

describe("number input parsing", () => {
  it("parses finite required number inputs", () => {
    expect(parseRequiredNumberInput("0")).toBe(0);
    expect(parseRequiredNumberInput("-12.5")).toBe(-12.5);
  });

  it("ignores blank and invalid required number inputs", () => {
    expect(parseRequiredNumberInput("")).toBeUndefined();
    expect(parseRequiredNumberInput("   ")).toBeUndefined();
    expect(parseRequiredNumberInput("NaN")).toBeUndefined();
  });

  it("uses blank optional number inputs as undefined", () => {
    expect(parseOptionalNumberInput("")).toBeUndefined();
    expect(parseOptionalNumberInput("36")).toBe(36);
  });
});
