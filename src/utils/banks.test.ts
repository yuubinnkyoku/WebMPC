import { describe, expect, it } from "vitest";
import { BANKS, formatBankAriaLabel } from "./banks";

describe("pad banks", () => {
  it("keeps the supported bank order stable", () => {
    expect(BANKS).toEqual(["A", "B", "C", "D"]);
  });

  it("formats bank switch labels", () => {
    expect(formatBankAriaLabel("A")).toBe("Show bank A");
    expect(formatBankAriaLabel("D")).toBe("Show bank D");
  });
});
