import { describe, expect, it } from "vitest";

import {
  allocateProportional,
  changeDue,
  computeDiscountAmount,
  computeOrderTotals,
  extractInclusiveTax,
  lineTotal,
  remainingDue,
  type OrderLineInput,
} from "@/lib/order-math";

const line = (unitPrice: number, qty: number, taxRateBp = 0, modifiersDelta = 0): OrderLineInput => ({
  unitPrice,
  qty,
  taxRateBp,
  modifiersDelta,
});

describe("lineTotal", () => {
  it("multiplies unit price by qty", () => {
    expect(lineTotal(line(50000, 2))).toBe(100000); // 2 × 500 DA
  });
  it("includes modifier deltas per unit", () => {
    // Cheeseburger 450 + extra cheese 50 + egg 30 → 530 × 2 = 1060 DA
    expect(lineTotal(line(45000, 2, 0, 8000))).toBe(106000);
  });
});

describe("computeDiscountAmount", () => {
  it("percent discount (10% of 1550)", () => {
    expect(computeDiscountAmount(155000, { kind: "percent", value: 1000 })).toBe(15500);
  });
  it("fixed discount", () => {
    expect(computeDiscountAmount(155000, { kind: "fixed", value: 10000 })).toBe(10000);
  });
  it("caps at subtotal and floors at zero", () => {
    expect(computeDiscountAmount(5000, { kind: "fixed", value: 99999 })).toBe(5000);
    expect(computeDiscountAmount(5000, { kind: "fixed", value: -50 })).toBe(0);
    expect(computeDiscountAmount(0, { kind: "percent", value: 1000 })).toBe(0);
  });
});

describe("allocateProportional", () => {
  it("sums exactly to the total (largest remainder)", () => {
    const shares = allocateProportional([333, 333, 334], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("proportional weights", () => {
    expect(allocateProportional([100, 300], 40)).toEqual([10, 30]);
  });
  it("handles zero weights", () => {
    expect(allocateProportional([0, 0], 50)).toEqual([0, 0]);
  });
});

describe("computeOrderTotals — spec §23 receipt example", () => {
  // 2 × Burger 1000 + 1 × Fries 250 + 2 × Drink 300 = 1550 · discount 100 → 1450
  it("subtotal 1550, discount 100, total 1450 (inclusive, no VAT)", () => {
    const totals = computeOrderTotals({
      lines: [line(50000, 2), line(25000, 1), line(15000, 2)],
      discount: { kind: "fixed", value: 10000 },
      taxMode: "inclusive",
    });
    expect(totals.subtotal).toBe(155000);
    expect(totals.discountAmount).toBe(10000);
    expect(totals.total).toBe(145000);
    expect(totals.taxAmount).toBe(0);
  });

  it("inclusive VAT is extracted for reporting without changing the total", () => {
    // 1 item at 1190 TTC with 19% VAT → total stays 1190, tax = 190
    const totals = computeOrderTotals({ lines: [line(119000, 1, 1900)], taxMode: "inclusive" });
    expect(totals.total).toBe(119000);
    expect(totals.taxAmount).toBe(19000);
  });

  it("exclusive tax is added on top", () => {
    const totals = computeOrderTotals({ lines: [line(100000, 1, 1900)], taxMode: "exclusive" });
    expect(totals.taxAmount).toBe(19000);
    expect(totals.total).toBe(119000);
  });

  it("discount reduces the taxable base proportionally", () => {
    // two 19% lines of 500 & 1500, 10% discount → net 1800, tax = 1800·19/119
    const totals = computeOrderTotals({
      lines: [line(50000, 1, 1900), line(150000, 1, 1900)],
      discount: { kind: "percent", value: 1000 },
      taxMode: "inclusive",
    });
    expect(totals.total).toBe(180000);
    expect(totals.taxAmount).toBe(extractInclusiveTax(45000, 1900) + extractInclusiveTax(135000, 1900));
  });

  it("adds the delivery fee after discount", () => {
    const totals = computeOrderTotals({
      lines: [line(60000, 1)],
      deliveryFee: 15000,
      taxMode: "inclusive",
    });
    expect(totals.total).toBe(75000);
  });
});

describe("payments — spec §18/§19 examples", () => {
  it("change: total 850, received 1000 → change 150", () => {
    expect(changeDue(85000, 100000)).toBe(15000);
  });
  it("no negative change", () => {
    expect(changeDue(85000, 50000)).toBe(0);
  });
  it("split payment: total 2000 = cash 1000 + card 1000", () => {
    const total = 200000;
    let paid = 0;
    paid += 100000; // cash
    expect(remainingDue(total, paid)).toBe(100000);
    paid += 100000; // card
    expect(remainingDue(total, paid)).toBe(0);
  });
});
