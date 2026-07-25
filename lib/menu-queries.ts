import "server-only";

import { db } from "@/lib/db";
import { recipeCostMilli } from "@/lib/food-cost";

/**
 * Compute the theoretical cost (millicentimes) for every product of the org.
 * - simple products: base recipe cost; falls back to manual costPrice
 * - combos: own recipe (packaging…) + Σ default choice costs per group
 */
export async function productCostsMilli(orgId: string): Promise<Map<string, number>> {
  const [products, recipes] = await Promise.all([
    db.product.findMany({ where: { orgId }, select: { id: true, type: true, costPrice: true } }),
    db.recipe.findMany({
      where: { product: { orgId }, variantId: null },
      include: { items: { include: { ingredient: { select: { avgCostMilli: true } } } } },
    }),
  ]);

  const baseCost = new Map<string, number>();
  for (const recipe of recipes) {
    baseCost.set(
      recipe.productId,
      recipeCostMilli(recipe.items.map((i) => ({ qty: i.qty, avgCostMilli: i.ingredient.avgCostMilli })))
    );
  }

  const costs = new Map<string, number>();
  for (const p of products) {
    // manual costPrice (centimes) is the fallback when no recipe exists
    costs.set(p.id, baseCost.get(p.id) ?? p.costPrice * 1000);
  }

  // Combos: add default choices on top of own recipe/manual cost
  const comboGroups = await db.comboGroup.findMany({
    where: { product: { orgId } },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  const groupsByCombo = new Map<string, typeof comboGroups>();
  for (const g of comboGroups) {
    const list = groupsByCombo.get(g.productId) ?? [];
    list.push(g);
    groupsByCombo.set(g.productId, list);
  }
  for (const p of products) {
    if (p.type !== "combo") continue;
    let total = baseCost.get(p.id) ?? p.costPrice * 1000;
    for (const g of groupsByCombo.get(p.id) ?? []) {
      const choice = g.items.find((i) => i.isDefault) ?? g.items[0];
      if (choice) total += costs.get(choice.productId) ?? 0;
    }
    costs.set(p.id, total);
  }

  return costs;
}

/** Everything the product editor needs, serializable for the client. */
export async function getProductEditorData(orgId: string, productId: string | null) {
  const [categories, modifierGroups, ingredients, simpleProducts, product] = await Promise.all([
    db.category.findMany({ where: { orgId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, isActive: true } }),
    db.modifierGroup.findMany({
      where: { orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, minSelect: true, maxSelect: true, modifiers: { where: { isActive: true }, select: { id: true, name: true, priceDelta: true } } },
    }),
    db.ingredient.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, displayUnit: true, avgCostMilli: true, category: true },
    }),
    db.product.findMany({
      where: { orgId, type: "simple", isActive: true },
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, sellPrice: true, categoryId: true },
    }),
    productId
      ? db.product.findFirst({
          where: { id: productId, orgId },
          include: {
            variants: { orderBy: { sortOrder: "asc" } },
            modifierGroups: { orderBy: { sortOrder: "asc" }, select: { groupId: true } },
            comboGroups: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
            recipes: { include: { items: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  return { categories, modifierGroups, ingredients, simpleProducts, product };
}
