"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertAnyPermission, ForbiddenError } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { ingredientSchema, type IngredientInput } from "@/lib/validation/menu";
import { UNIT_FACTORS, isUnitCompatible } from "@/lib/units";

const WRITE_PERMS = ["inventory.adjust", "menu.manage"];

/**
 * Convert "cost per display unit" (centimes) → millicentimes per BASE unit.
 * 850 DA/kg = 85 000 c/kg → ×1000 / 1000(g per kg) = 85 000 milli/g.
 */
function costPerDisplayToMilliPerBase(costCentimes: number, displayUnit: IngredientInput["displayUnit"]): number {
  const factor = UNIT_FACTORS[displayUnit].factor;
  return Math.round((costCentimes * 1000) / factor);
}

export async function saveIngredientAction(input: IngredientInput): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertAnyPermission(WRITE_PERMS);
    const parsed = ingredientSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;

    if (!isUnitCompatible(data.displayUnit, data.baseUnit)) return fail("incompatible_units");
    const avgCostMilli = costPerDisplayToMilliPerBase(data.costPerDisplayUnit, data.displayUnit);

    if (data.id) {
      const existing = await db.ingredient.findFirst({ where: { id: data.id, orgId: auth.user.orgId } });
      if (!existing) return fail("not_found");

      // Base unit is immutable once stock movements exist (would corrupt the ledger's units)
      if (existing.baseUnit !== data.baseUnit) {
        const movements = await db.stockMovement.count({ where: { ingredientId: existing.id } });
        if (movements > 0) return fail("base_unit_locked");
      }

      const updated = await db.ingredient.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          category: data.category ?? null,
          sku: data.sku ?? null,
          barcode: data.barcode ?? null,
          baseUnit: data.baseUnit,
          displayUnit: data.displayUnit,
          avgCostMilli,
          isActive: data.isActive,
        },
      });
      await writeAudit({
        orgId: auth.user.orgId,
        userId: auth.user.id,
        action: "inventory.ingredient_updated",
        entity: "ingredient",
        entityId: updated.id,
        before: { name: existing.name, avgCostMilli: existing.avgCostMilli, isActive: existing.isActive },
        after: { name: updated.name, avgCostMilli: updated.avgCostMilli, isActive: updated.isActive },
      });
      revalidatePath("/ingredients");
      revalidatePath("/menu");
      return ok({ id: updated.id });
    }

    const created = await db.ingredient.create({
      data: {
        orgId: auth.user.orgId,
        name: data.name,
        category: data.category ?? null,
        sku: data.sku ?? null,
        barcode: data.barcode ?? null,
        baseUnit: data.baseUnit,
        displayUnit: data.displayUnit,
        avgCostMilli,
        lastCostMilli: avgCostMilli,
        isActive: data.isActive,
      },
    });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "inventory.ingredient_created",
      entity: "ingredient",
      entityId: created.id,
      after: { name: created.name, avgCostMilli: created.avgCostMilli },
    });
    revalidatePath("/ingredients");
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

/**
 * Delete when never referenced; otherwise deactivate (recipes, modifiers,
 * movements and purchase lines must keep their history intact).
 */
export async function deleteIngredientAction(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const auth = await assertAnyPermission(WRITE_PERMS);
    const ingredient = await db.ingredient.findFirst({
      where: { id, orgId: auth.user.orgId },
      include: {
        _count: {
          select: { recipeItems: true, modifiers: true, stockMovements: true, purchaseItems: true, inventory: true },
        },
      },
    });
    if (!ingredient) return fail("not_found");

    const refs =
      ingredient._count.recipeItems +
      ingredient._count.modifiers +
      ingredient._count.stockMovements +
      ingredient._count.purchaseItems;

    if (refs === 0) {
      await db.$transaction([
        db.inventory.deleteMany({ where: { ingredientId: id } }),
        db.ingredient.delete({ where: { id } }),
      ]);
      await writeAudit({
        orgId: auth.user.orgId,
        userId: auth.user.id,
        action: "inventory.ingredient_deleted",
        entity: "ingredient",
        entityId: id,
        before: { name: ingredient.name },
      });
      revalidatePath("/ingredients");
      return ok({ deactivated: false });
    }

    await db.ingredient.update({ where: { id }, data: { isActive: false } });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "inventory.ingredient_deactivated",
      entity: "ingredient",
      entityId: id,
      before: { name: ingredient.name, isActive: true },
      after: { isActive: false },
    });
    revalidatePath("/ingredients");
    return ok({ deactivated: true });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}
