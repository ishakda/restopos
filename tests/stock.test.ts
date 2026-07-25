import { describe, expect, it } from "vitest";

import { stockLevel, stockValueCentimes, weightedAverageCostMilli } from "@/lib/stock";

describe("weightedAverageCostMilli", () => {
  it("computes the weighted average", () => {
    // 5 kg @ 850 DA/kg + 5 kg @ 950 DA/kg → 900 DA/kg
    // (base units: 5000 g @ 85 000 milli/g + 5000 g @ 95 000 milli/g)
    expect(weightedAverageCostMilli(5000, 85_000, 5000, 95_000)).toBe(90_000);
  });
  it("weights by quantity", () => {
    // 9 u @ 100 + 1 u @ 200 → 110
    expect(weightedAverageCostMilli(9, 100, 1, 200)).toBe(110);
  });
  it("received cost wins when current stock is zero or negative", () => {
    expect(weightedAverageCostMilli(0, 85_000, 3000, 95_000)).toBe(95_000);
    expect(weightedAverageCostMilli(-500, 85_000, 3000, 95_000)).toBe(95_000);
  });
  it("keeps current average when nothing is received", () => {
    expect(weightedAverageCostMilli(5000, 85_000, 0, 95_000)).toBe(85_000);
  });
  it("adopts received cost when current average is unset", () => {
    expect(weightedAverageCostMilli(5000, 0, 1000, 95_000)).toBe(95_000);
  });
});

describe("stockValueCentimes", () => {
  it("rounds milli to centimes", () => {
    // 90 g @ 85 000 milli/g = 7 650 000 milli = 7650 centimes (76,50 DA)
    expect(stockValueCentimes(90, 85_000)).toBe(7650);
  });
  it("handles zero", () => {
    expect(stockValueCentimes(0, 85_000)).toBe(0);
  });
});

describe("stockLevel", () => {
  it("out at or below zero", () => {
    expect(stockLevel(0, 5000)).toBe("out");
    expect(stockLevel(-10, 0)).toBe("out");
  });
  it("low at or below the threshold (spec §11: 4 kg current, 5 kg min)", () => {
    expect(stockLevel(4000, 5000)).toBe("low");
    expect(stockLevel(5000, 5000)).toBe("low");
  });
  it("ok above the threshold or when no threshold", () => {
    expect(stockLevel(6000, 5000)).toBe("ok");
    expect(stockLevel(1, 0)).toBe("ok");
  });
});
