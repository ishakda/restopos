/**
 * Theoretical food-cost engine — pure functions, usable server- and client-side.
 *
 * Units contract (see docs/ARCHITECTURE.md):
 *  - quantities: integer BASE units (g / ml / unit)
 *  - ingredient costs: integer MILLICENTIMES per base unit
 *  - prices/margins: integer CENTIMES
 *  - rates: integer BASIS POINTS (1900 = 19%)
 */

import { BASIS_POINTS_DENOMINATOR, milliToCentimes } from "@/lib/money";

export interface CostableRecipeItem {
  qty: number; // base units
  avgCostMilli: number; // millicentimes per base unit
}

/** Total theoretical cost of one product unit, in millicentimes. */
export function recipeCostMilli(items: CostableRecipeItem[]): number {
  let total = 0;
  for (const item of items) total += item.qty * item.avgCostMilli;
  return total;
}

export type TaxMode = "inclusive" | "exclusive";

/**
 * Net revenue (excl. tax) for a given sell price.
 * - inclusive: price is TTC → net = price − price·r/(1+r)
 * - exclusive: price is already HT
 */
export function netRevenueCentimes(sellPrice: number, taxRateBp: number, mode: TaxMode): number {
  if (mode === "exclusive" || taxRateBp <= 0) return sellPrice;
  const tax = Math.round((sellPrice * taxRateBp) / (BASIS_POINTS_DENOMINATOR + taxRateBp));
  return sellPrice - tax;
}

export interface FoodCostAnalysis {
  /** ingredient cost per unit, centimes */
  costCentimes: number;
  /** revenue excl. tax, centimes */
  netRevenueCentimes: number;
  /** net revenue − cost, centimes */
  grossMarginCentimes: number;
  /** cost / net revenue, in basis points (3833 = 38.33%). null when revenue is 0 */
  foodCostBp: number | null;
}

export function analyzeFoodCost(params: {
  sellPrice: number; // centimes
  taxRateBp?: number;
  taxMode?: TaxMode;
  costMilli: number; // millicentimes per product unit
}): FoodCostAnalysis {
  const { sellPrice, taxRateBp = 0, taxMode = "inclusive", costMilli } = params;
  const cost = milliToCentimes(costMilli);
  const net = netRevenueCentimes(sellPrice, taxRateBp, taxMode);
  return {
    costCentimes: cost,
    netRevenueCentimes: net,
    grossMarginCentimes: net - cost,
    foodCostBp: net > 0 ? Math.round((cost / net) * BASIS_POINTS_DENOMINATOR) : null,
  };
}

/** Human food-cost % ("38.3%") from basis points. */
export function formatFoodCostPct(bp: number | null): string {
  if (bp === null) return "—";
  const pct = bp / 100;
  return `${(Math.round(pct * 10) / 10).toString()}%`;
}

/**
 * Food-cost health bands used by the UI (fast-food conventions):
 * good ≤ 35% · warning 35–45% · bad > 45%
 */
export function foodCostLevel(bp: number | null): "unknown" | "good" | "warning" | "bad" {
  if (bp === null) return "unknown";
  if (bp <= 3500) return "good";
  if (bp <= 4500) return "warning";
  return "bad";
}
