import { describe, expect, it } from "vitest";
import { ActiveInputs } from "./activeInputs";

describe("active input tracking", () => {
  it("releases the value captured when an input was pressed", () => {
    const inputs = new ActiveInputs<string>();

    expect(inputs.hold("Digit1", "pad-a1")).toBeUndefined();
    expect(inputs.release("Digit1")).toBe("pad-a1");
    expect(inputs.release("Digit1")).toBeUndefined();
  });

  it("returns the previous value when an active input is remapped", () => {
    const inputs = new ActiveInputs<string>();
    inputs.hold("MPD218:1:36", "pad-a1");

    expect(inputs.hold("MPD218:1:36", "pad-b1")).toBe("pad-a1");
    expect(inputs.release("MPD218:1:36")).toBe("pad-b1");
  });

  it("drains all held inputs on focus or device loss", () => {
    const inputs = new ActiveInputs<string>();
    inputs.hold("Digit1", "pad-a1");
    inputs.hold("KeyQ", "pad-a5");

    expect(inputs.drain()).toEqual(["pad-a1", "pad-a5"]);
    expect(inputs.drain()).toEqual([]);
  });
});
