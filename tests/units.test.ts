import { describe, expect, it } from "vitest";

import { displayUnitsFor, formatQty, fromBaseUnits, isUnitCompatible, toBaseUnits } from "@/lib/units";

describe("unit conversions", () => {
  it("kg → g", () => {
    expect(toBaseUnits(2, "kg")).toBe(2000);
    expect(toBaseUnits(0.1, "kg")).toBe(100);
  });
  it("L → ml", () => {
    expect(toBaseUnits(1.5, "L")).toBe(1500);
  });
  it("unit passthrough", () => {
    expect(toBaseUnits(3, "unit")).toBe(3);
    expect(toBaseUnits(30, "g")).toBe(30);
  });
  it("fromBaseUnits inverts", () => {
    expect(fromBaseUnits(2000, "kg")).toBe(2);
    expect(fromBaseUnits(1500, "L")).toBe(1.5);
  });
  it("compatibility checks", () => {
    expect(isUnitCompatible("kg", "g")).toBe(true);
    expect(isUnitCompatible("L", "g")).toBe(false);
    expect(isUnitCompatible("unit", "unit")).toBe(true);
  });
  it("display units per base", () => {
    expect(displayUnitsFor("g")).toEqual(["g", "kg"]);
    expect(displayUnitsFor("ml")).toEqual(["ml", "L"]);
    expect(displayUnitsFor("unit")).toEqual(["unit"]);
  });
});

describe("formatQty", () => {
  it("auto-scales grams to kg", () => {
    expect(formatQty(4000, "g")).toBe("4 kg");
    expect(formatQty(4500, "g")).toBe("4.5 kg");
  });
  it("keeps small grams", () => {
    expect(formatQty(350, "g")).toBe("350 g");
  });
  it("auto-scales ml to L", () => {
    expect(formatQty(2000, "ml")).toBe("2 L");
  });
  it("units", () => {
    expect(formatQty(12, "unit")).toBe("12 u");
  });
});
