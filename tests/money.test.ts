import { describe, expect, it } from "vitest";

import {
  applyBasisPoints,
  daToCentimes,
  formatBasisPoints,
  formatMoney,
  milliToCentimes,
  parseMoneyInput,
} from "@/lib/money";

describe("formatMoney", () => {
  it("formats whole dinars without decimals (fr)", () => {
    expect(formatMoney(145000, "fr")).toBe("1 450 DA"); // narrow nbsp group separator
  });
  it("formats centimes with 2 decimals when present", () => {
    expect(formatMoney(145050, "fr")).toBe("1 450,50 DA");
  });
  it("uses دج suffix in Arabic with Latin digits", () => {
    const out = formatMoney(60000, "ar");
    expect(out).toContain("دج");
    expect(out).toContain("600");
  });
  it("formats zero", () => {
    expect(formatMoney(0, "en")).toBe("0 DA");
  });
  it("supports signed display", () => {
    expect(formatMoney(5000, "en", { signed: true })).toBe("+50 DA");
    expect(formatMoney(-5000, "en")).toContain("-");
  });
});

describe("parseMoneyInput", () => {
  it("parses plain integers", () => {
    expect(parseMoneyInput("450")).toBe(45000);
  });
  it("parses comma decimals", () => {
    expect(parseMoneyInput("1450,50")).toBe(145050);
  });
  it("parses dot decimals", () => {
    expect(parseMoneyInput("1450.5")).toBe(145050);
  });
  it("parses spaced thousands", () => {
    expect(parseMoneyInput("1 450")).toBe(145000);
  });
  it("parses mixed thousand+decimal", () => {
    expect(parseMoneyInput("1,450.50")).toBe(145050);
  });
  it("treats 3-digit tail after single separator as thousands", () => {
    expect(parseMoneyInput("1.450")).toBe(145000);
    expect(parseMoneyInput("1,450")).toBe(145000);
  });
  it("rejects garbage", () => {
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("12,3,4")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
  });
  it("parses negatives", () => {
    expect(parseMoneyInput("-250")).toBe(-25000);
  });
});

describe("conversions & rounding", () => {
  it("daToCentimes", () => {
    expect(daToCentimes(600)).toBe(60000);
    expect(daToCentimes(0.5)).toBe(50);
  });
  it("milliToCentimes rounds half away from zero", () => {
    expect(milliToCentimes(1500)).toBe(2);
    expect(milliToCentimes(1499)).toBe(1);
    expect(milliToCentimes(-1500)).toBe(-2);
  });
  it("applyBasisPoints computes 19% VAT", () => {
    // 600 DA at 19% → 114 DA
    expect(applyBasisPoints(60000, 1900)).toBe(11400);
  });
  it("applyBasisPoints rounds correctly", () => {
    // 333 centimes at 10% = 33.3 → 33
    expect(applyBasisPoints(333, 1000)).toBe(33);
    // 335 at 10% = 33.5 → 34
    expect(applyBasisPoints(335, 1000)).toBe(34);
  });
  it("formatBasisPoints", () => {
    expect(formatBasisPoints(1900, "en")).toBe("19%");
    expect(formatBasisPoints(950, "en")).toBe("9.5%");
  });
});
