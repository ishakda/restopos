/** POS cart — client-side draft state. Prices here are PREVIEW ONLY: the
 * server re-reads every price from the DB when the order is created. */

export interface CartModifier {
  id: string;
  name: string;
  priceDelta: number;
}

export interface CartComboSelection {
  comboGroupId: string;
  groupName: string;
  productId: string;
  name: string;
  priceDelta: number;
}

export interface CartLine {
  uid: string;
  productId: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  /** product price + variant delta + combo choice deltas (per unit) */
  baseUnitPrice: number;
  taxRate: number;
  modifiers: CartModifier[];
  comboSelections: CartComboSelection[];
  qty: number;
  notes: string;
}

export function cartLineUnitPrice(line: CartLine): number {
  return line.baseUnitPrice + line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
}

export function cartLineTotal(line: CartLine): number {
  return cartLineUnitPrice(line) * line.qty;
}

/** Two lines with identical configuration can be merged (qty bump). */
export function cartConfigKey(line: Omit<CartLine, "uid" | "qty">): string {
  return JSON.stringify({
    p: line.productId,
    v: line.variantId,
    m: line.modifiers.map((m) => m.id).sort(),
    c: line.comboSelections.map((s) => `${s.comboGroupId}:${s.productId}`).sort(),
    n: line.notes.trim(),
  });
}
