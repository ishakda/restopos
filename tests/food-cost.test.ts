import { describe, expect, it } from "vitest";

import {
  analyzeFoodCost,
  foodCostLevel,
  formatFoodCostPct,
  netRevenueCentimes,
  recipeCostMilli,
} from "@/lib/food-cost";

describe("recipeCostMilli", () => {
  it("sums qty × unit cost", () => {
    // 100g meat @ 85 000 milli/g + 1 bun @ 2 500 000 milli/unit
    expect(recipeCostMilli([
      { qty: 100, avgCostMilli: 85_000 },
      { qty: 1, avgCostMilli: 2_500_000 },
    ])).toBe(11_000_000); // 110 DA
  });
  it("empty recipe costs 0", () => {
    expect(recipeCostMilli([])).toBe(0);
  });
});

describe("netRevenueCentimes", () => {
  it("returns full price when tax-exclusive or zero rate", () => {
    expect(netRevenueCentimes(60000, 1900, "exclusive")).toBe(60000);
    expect(netRevenueCentimes(60000, 0, "inclusive")).toBe(60000);
  });
  it("extracts 19% VAT from an inclusive price", () => {
    // 1190 DA TTC at 19% → 1000 DA net
    expect(netRevenueCentimes(119000, 1900, "inclusive")).toBe(100000);
  });
  it("extracts 9% VAT from an inclusive price", () => {
    // 109 DA TTC at 9% → 100 DA net
    expect(netRevenueCentimes(10900, 900, "inclusive")).toBe(10000);
  });
});

describe("analyzeFoodCost — spec §9 example", () => {
  it("sell 600 DZD, cost 230 DZD → margin 370, food cost 38.3%", () => {
    const analysis = analyzeFoodCost({
      sellPrice: 60000, // 600 DA
      taxRateBp: 0,
      costMilli: 23_000_000, // 230 DA
    });
    expect(analysis.costCentimes).toBe(23000);
    expect(analysis.grossMarginCentimes).toBe(37000);
    expect(analysis.foodCostBp).toBe(3833);
    expect(formatFoodCostPct(analysis.foodCostBp)).toBe("38.3%");
  });

  it("handles zero sell price without dividing by zero", () => {
    const analysis = analyzeFoodCost({ sellPrice: 0, costMilli: 1_000_000 });
    expect(analysis.foodCostBp).toBeNull();
    expect(formatFoodCostPct(analysis.foodCostBp)).toBe("—");
  });

  it("accounts for inclusive tax in the ratio", () => {
    // 1190 TTC @19% → net 1000; cost 380 → 38%
    const analysis = analyzeFoodCost({
      sellPrice: 119000,
      taxRateBp: 1900,
      taxMode: "inclusive",
      costMilli: 38_000_000,
    });
    expect(analysis.netRevenueCentimes).toBe(100000);
    expect(analysis.foodCostBp).toBe(3800);
  });
});

describe("foodCostLevel bands", () => {
  it("≤35% good, 35–45% warning, >45% bad", () => {
    expect(foodCostLevel(3000)).toBe("good");
    expect(foodCostLevel(3500)).toBe("good");
    expect(foodCostLevel(3833)).toBe("warning");
    expect(foodCostLevel(4500)).toBe("warning");
    expect(foodCostLevel(4600)).toBe("bad");
    expect(foodCostLevel(null)).toBe("unknown");
  });
});
