import { describe, expect, it } from "vitest";
import { quotePocketBaseFilterValue } from "./pocketbaseFilter";

describe("PocketBase filter utilities", () => {
  it("quotes simple values", () => {
    expect(quotePocketBaseFilterValue("project_1")).toBe('"project_1"');
  });

  it("escapes quotes and backslashes", () => {
    expect(quotePocketBaseFilterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});
