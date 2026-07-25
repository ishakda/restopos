/**
 * Order money math — pure, integer-only, unit-tested.
 * All amounts are CENTIMES; all rates are BASIS POINTS.
 *
 * The SERVER is the only price authority: these functions run on server-built
 * lines (prices re-read from the DB), never on client-sent amounts.
 */

import { BASIS_POINTS_DENOMINATOR, applyBasisPoints } from "@/lib/money";

export interface OrderLineInput {
  /** unit price incl. variant delta (and combo choice deltas for combo lines) */
  unitPrice: number;
  qty: number;
  taxRateBp: number;
  /** Σ selected modifier price deltas, per unit */
  modifiersDelta: number;
}

export function lineUnitPrice(line: Pick<OrderLineInput, "unitPrice" | "modifiersDelta">): number {
  return line.unitPrice + line.modifiersDelta;
}

export function lineTotal(line: OrderLineInput): number {
  return lineUnitPrice(line) * line.qty;
}

export type DiscountKind = "percent" | "fixed";

export interface DiscountInput {
  kind: DiscountKind;
  /** percent: basis points (1000 = 10%) · fixed: centimes */
  value: number;
}

/** Order-level discount amount, capped to the subtotal, never negative. */
export function computeDiscountAmount(subtotal: number, discount: DiscountInput | null | undefined): number {
  if (!discount || subtotal <= 0) return 0;
  const raw =
    discount.kind === "percent"
      ? applyBasisPoints(subtotal, Math.max(0, discount.value))
      : Math.max(0, discount.value);
  return Math.min(raw, subtotal);
}

/**
 * Allocate `total` across `weights` proportionally using the largest-remainder
 * method — Σ result === total exactly (no lost/created centimes).
 */
export function allocateProportional(weights: number[], total: number): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w * total) / weightSum);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = [...floors];
  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    result[order[i]!.index]! += 1;
  }
  return result;
}

/** Tax portion embedded in a tax-INCLUSIVE amount. */
export function extractInclusiveTax(amount: number, taxRateBp: number): number {
  if (taxRateBp <= 0 || amount <= 0) return 0;
  return Math.round((amount * taxRateBp) / (BASIS_POINTS_DENOMINATOR + taxRateBp));
}

export type TaxMode = "inclusive" | "exclusive";

export interface OrderTotals {
  subtotal: number;
  discountAmount: number;
  /** inclusive mode: informational tax embedded in the total; exclusive: added on top */
  taxAmount: number;
  deliveryFee: number;
  total: number;
}

export function computeOrderTotals(params: {
  lines: OrderLineInput[];
  discount?: DiscountInput | null;
  deliveryFee?: number;
  taxMode: TaxMode;
}): OrderTotals {
  const { lines, discount, deliveryFee = 0, taxMode } = params;

  const lineTotals = lines.map(lineTotal);
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const discountAmount = computeDiscountAmount(subtotal, discount);

  // Allocate the order discount across lines to tax each line's NET share.
  const discountShares = allocateProportional(lineTotals, discountAmount);
  const netLines = lineTotals.map((amount, i) => amount - (discountShares[i] ?? 0));

  let taxAmount = 0;
  for (let i = 0; i < lines.length; i++) {
    const rate = lines[i]!.taxRateBp;
    const net = netLines[i]!;
    taxAmount += taxMode === "inclusive" ? extractInclusiveTax(net, rate) : applyBasisPoints(net, rate);
  }

  const total =
    taxMode === "inclusive"
      ? subtotal - discountAmount + deliveryFee
      : subtotal - discountAmount + taxAmount + deliveryFee;

  return { subtotal, discountAmount, taxAmount, deliveryFee, total };
}

/** Cash change: what goes back to the customer. */
export function changeDue(amountDue: number, received: number): number {
  return Math.max(0, received - amountDue);
}

/** What is still owed on an order. */
export function remainingDue(total: number, paidAmount: number): number {
  return Math.max(0, total - paidAmount);
}
