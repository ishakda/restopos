import "server-only";

import { Prisma } from "@prisma/client";

import { recipeCostMilli } from "@/lib/food-cost";
import { stockValueCentimes } from "@/lib/stock";
import { emitOrderEvent } from "@/lib/events";

type Tx = Prisma.TransactionClient;

export class OutOfStockError extends Error {
  constructor(public ingredientName: string) {
    super(`out_of_stock:${ingredientName}`);
    this.name = "OutOfStockError";
  }
}

/** Minimal shape of a built order line (see createOrderAction). */
export interface ConsumableItem {
  productId: string;
  variantId: string | null;
  qty: number;
  modifiers: { ingredientId: string | null; ingredientQty: number | null }[];
  children: { productId: string; qty: number }[];
}

interface RecipeLookup {
  /** key: productId::variantId (variantId "" for base) */
  map: Map<string, { ingredientId: string; qty: number }[]>;
}

async function loadRecipes(tx: Tx, items: ConsumableItem[]): Promise<RecipeLookup> {
  const productIds = [
    ...new Set([...items.map((i) => i.productId), ...items.flatMap((i) => i.children.map((c) => c.productId))]),
  ];
  const recipes = await tx.recipe.findMany({
    where: { productId: { in: productIds } },
    include: { items: { select: { ingredientId: true, qty: true } } },
  });
  const map = new Map<string, { ingredientId: string; qty: number }[]>();
  for (const recipe of recipes) {
    map.set(`${recipe.productId}::${recipe.variantId ?? ""}`, recipe.items);
  }
  return { map };
}

function recipeFor(lookup: RecipeLookup, productId: string, variantId: string | null) {
  return (
    (variantId ? lookup.map.get(`${productId}::${variantId}`) : undefined) ??
    lookup.map.get(`${productId}::`) ??
    []
  );
}

/**
 * Aggregate ingredient consumption (base units) for a set of order lines:
 * item recipe (variant recipe falls back to base) × qty
 * + combo children recipes × child qty
 * + modifier ingredient consumption × qty.
 */
export async function buildConsumption(tx: Tx, items: ConsumableItem[]): Promise<Map<string, number>> {
  const lookup = await loadRecipes(tx, items);
  const consumption = new Map<string, number>();
  const add = (ingredientId: string, qty: number) => {
    if (qty <= 0) return;
    consumption.set(ingredientId, (consumption.get(ingredientId) ?? 0) + qty);
  };

  for (const item of items) {
    for (const ri of recipeFor(lookup, item.productId, item.variantId)) {
      add(ri.ingredientId, ri.qty * item.qty);
    }
    for (const child of item.children) {
      for (const ri of recipeFor(lookup, child.productId, null)) {
        add(ri.ingredientId, ri.qty * child.qty);
      }
    }
    for (const modifier of item.modifiers) {
      if (modifier.ingredientId && modifier.ingredientQty) {
        add(modifier.ingredientId, modifier.ingredientQty * item.qty);
      }
    }
  }
  return consumption;
}

/**
 * Theoretical cost per UNIT of each line (millicentimes) — stored as the
 * item's cost snapshot for profitability reporting.
 */
export async function computeItemCostsMilli(tx: Tx, items: ConsumableItem[]): Promise<Map<ConsumableItem, number>> {
  const lookup = await loadRecipes(tx, items);
  const ingredientIds = new Set<string>();
  for (const recipeItems of lookup.map.values()) {
    for (const ri of recipeItems) ingredientIds.add(ri.ingredientId);
  }
  for (const item of items) {
    for (const m of item.modifiers) if (m.ingredientId) ingredientIds.add(m.ingredientId);
  }
  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: [...ingredientIds] } },
    select: { id: true, avgCostMilli: true },
  });
  const costOf = new Map(ingredients.map((i) => [i.id, i.avgCostMilli]));

  const result = new Map<ConsumableItem, number>();
  for (const item of items) {
    let perUnit = recipeCostMilli(
      recipeFor(lookup, item.productId, item.variantId).map((ri) => ({
        qty: ri.qty,
        avgCostMilli: costOf.get(ri.ingredientId) ?? 0,
      }))
    );
    for (const child of item.children) {
      // children carry qty == parent qty → per parent unit = child recipe × 1
      perUnit += recipeCostMilli(
        recipeFor(lookup, child.productId, null).map((ri) => ({
          qty: ri.qty,
          avgCostMilli: costOf.get(ri.ingredientId) ?? 0,
        }))
      );
    }
    for (const modifier of item.modifiers) {
      if (modifier.ingredientId && modifier.ingredientQty) {
        perUnit += modifier.ingredientQty * (costOf.get(modifier.ingredientId) ?? 0);
      }
    }
    result.set(item, perUnit);
  }
  return result;
}

/**
 * Apply a consumption map to a branch's inventory — the ONLY sale-side stock
 * writer. Race-safe: uses ATOMIC conditional decrements (never read-then-write),
 * so two cashiers selling the last unit can never drive stock negative under
 * the "block" policy (spec §36 concurrency requirement).
 *
 * Every change writes a StockMovement ledger row. Low/out-of-stock alerts are
 * emitted AFTER the transaction commits via the returned callback.
 */
export async function applyStockDeduction(
  tx: Tx,
  params: {
    orgId: string;
    branchId: string;
    orderId: string;
    orderNumber: string;
    userId: string;
    consumption: Map<string, number>;
    policy: "block" | "allow";
  }
): Promise<() => void> {
  const { orgId, branchId, orderId, orderNumber, userId, consumption, policy } = params;
  if (consumption.size === 0) return () => {};

  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: [...consumption.keys()] } },
    select: { id: true, name: true, avgCostMilli: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  const alerts: { name: string; out: boolean }[] = [];

  for (const [ingredientId, need] of consumption) {
    const ingredient = byId.get(ingredientId);
    if (!ingredient) continue; // ingredient hard-deleted — nothing to deduct

    // Ensure the branch inventory row exists (safe under races: unique constraint)
    try {
      await tx.inventory.upsert({
        where: { branchId_ingredientId: { branchId, ingredientId } },
        update: {},
        create: { branchId, ingredientId, qtyOnHand: 0 },
      });
    } catch {
      // concurrent create — row exists now
    }

    // ATOMIC decrement (guarded when policy is "block")
    const updated = await tx.inventory.updateMany({
      where: {
        branchId,
        ingredientId,
        ...(policy === "block" ? { qtyOnHand: { gte: need } } : {}),
      },
      data: { qtyOnHand: { decrement: need } },
    });
    if (updated.count === 0) {
      throw new OutOfStockError(ingredient.name);
    }

    const row = await tx.inventory.findUniqueOrThrow({
      where: { branchId_ingredientId: { branchId, ingredientId } },
      select: { qtyOnHand: true, minQty: true },
    });
    const qtyAfter = row.qtyOnHand;
    const qtyBefore = qtyAfter + need;

    await tx.stockMovement.create({
      data: {
        orgId,
        branchId,
        ingredientId,
        type: "sale",
        qtyBefore,
        qtyChange: -need,
        qtyAfter,
        unitCostMilli: ingredient.avgCostMilli,
        totalCostCentimes: stockValueCentimes(need, ingredient.avgCostMilli),
        userId,
        orderId,
        reference: `#${orderNumber}`,
      },
    });

    if (qtyAfter <= 0) alerts.push({ name: ingredient.name, out: true });
    else if (row.minQty > 0 && qtyAfter <= row.minQty) alerts.push({ name: ingredient.name, out: false });
  }

  // Alerts fire only after the surrounding transaction commits
  return () => {
    for (const alert of alerts) {
      emitOrderEvent({
        type: "stock.alert",
        branchId,
        label: alert.name,
        status: alert.out ? "out" : "low",
      });
    }
  };
}

/**
 * Reverse a CONFIRMED order's sale movements (ledger-driven — immune to recipe
 * edits after the sale). Orders that already hit the kitchen are NOT auto
 * restocked: prepared food is waste, not inventory (record waste instead).
 */
export async function reverseOrderDeduction(
  tx: Tx,
  params: { orgId: string; branchId: string; orderId: string; orderNumber: string; userId: string }
): Promise<number> {
  const { orgId, branchId, orderId, orderNumber, userId } = params;
  const saleMovements = await tx.stockMovement.findMany({
    where: { orderId, type: "sale" },
  });

  for (const movement of saleMovements) {
    const restore = -movement.qtyChange; // sale changes are negative
    if (restore <= 0) continue;

    await tx.inventory.updateMany({
      where: { branchId: movement.branchId, ingredientId: movement.ingredientId },
      data: { qtyOnHand: { increment: restore } },
    });
    const row = await tx.inventory.findUniqueOrThrow({
      where: { branchId_ingredientId: { branchId: movement.branchId, ingredientId: movement.ingredientId } },
      select: { qtyOnHand: true },
    });
    await tx.stockMovement.create({
      data: {
        orgId,
        branchId,
        ingredientId: movement.ingredientId,
        type: "reversal",
        qtyBefore: row.qtyOnHand - restore,
        qtyChange: restore,
        qtyAfter: row.qtyOnHand,
        unitCostMilli: movement.unitCostMilli,
        totalCostCentimes: movement.totalCostCentimes,
        userId,
        orderId,
        reference: `#${orderNumber} (annulation)`,
      },
    });
  }
  return saleMovements.length;
}
