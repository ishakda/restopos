/**
 * Stock quantities are stored as integer BASE UNITS: g, ml or unit.
 * kg and L are display conveniences (×1000).
 */

import type { BaseUnit, DisplayUnit } from "@/lib/constants";

export const UNIT_FACTORS: Record<DisplayUnit, { base: BaseUnit; factor: number }> = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  L: { base: "ml", factor: 1000 },
  unit: { base: "unit", factor: 1 },
};

export function displayUnitsFor(base: BaseUnit): DisplayUnit[] {
  switch (base) {
    case "g":
      return ["g", "kg"];
    case "ml":
      return ["ml", "L"];
    case "unit":
      return ["unit"];
  }
}

/** Convert a quantity entered in a display unit into base units (integer). */
export function toBaseUnits(qty: number, displayUnit: DisplayUnit): number {
  const def = UNIT_FACTORS[displayUnit];
  return Math.round(qty * def.factor);
}

/** Convert base units into a display unit value (may be fractional). */
export function fromBaseUnits(qtyBase: number, displayUnit: DisplayUnit): number {
  const def = UNIT_FACTORS[displayUnit];
  return qtyBase / def.factor;
}

/** Check a display unit is compatible with a base unit. */
export function isUnitCompatible(displayUnit: DisplayUnit, base: BaseUnit): boolean {
  return UNIT_FACTORS[displayUnit].base === base;
}

/**
 * Human quantity: auto-scales g→kg / ml→L above 1000 base units.
 * formatQty(4000, "g") → "4 kg"; formatQty(350, "g") → "350 g"
 */
export function formatQty(qtyBase: number, base: BaseUnit, unitLabel?: string): string {
  if (base === "unit") {
    return `${trimNumber(qtyBase)} ${unitLabel ?? "u"}`;
  }
  const big = base === "g" ? "kg" : "L";
  if (Math.abs(qtyBase) >= 1000) {
    return `${trimNumber(qtyBase / 1000)} ${big}`;
  }
  return `${trimNumber(qtyBase)} ${base}`;
}

function trimNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}
