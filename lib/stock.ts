/**
 * Stock math — pure, integer-only, unit-tested.
 * Quantities: integer base units. Costs: integer millicentimes per base unit.
 */

/**
 * Weighted average cost after receiving goods.
 * When current stock is zero/negative the received cost becomes the new average
 * (a negative book quantity must not poison the average).
 */
export function weightedAverageCostMilli(
  currentQty: number,
  currentAvgMilli: number,
  receivedQty: number,
  receivedCostMilli: number
): number {
  if (receivedQty <= 0) return currentAvgMilli;
  if (currentQty <= 0 || currentAvgMilli <= 0) return receivedCostMilli;
  const totalValue = currentQty * currentAvgMilli + receivedQty * receivedCostMilli;
  return Math.round(totalValue / (currentQty + receivedQty));
}

/** Value of a quantity at a unit cost, in CENTIMES (rounded). */
export function stockValueCentimes(qty: number, unitCostMilli: number): number {
  const sign = qty * unitCostMilli < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(qty * unitCostMilli) / 1000);
}

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(qtyOnHand: number, minQty: number): StockLevel {
  if (qtyOnHand <= 0) return "out";
  if (minQty > 0 && qtyOnHand <= minQty) return "low";
  return "ok";
}
