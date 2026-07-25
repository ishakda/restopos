"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { productPayloadSchema, type ProductPayload } from "@/lib/validation/menu";
import { isUnitCompatible, toBaseUnits } from "@/lib/units";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";

/**
 * Save the full product aggregate (product, variants, modifier-group joins,
 * combo groups/items, recipes) in ONE transaction. Client sends display-unit
 * quantities; everything is validated and converted server-side.
 *
 * Variant identity: existing variants carry their id; new ones carry a client
 * key "new:N" used by recipes to reference not-yet-created variants.
 */
export async function saveProductAction(input: ProductPayload): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const parsed = productPayloadSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    const orgId = auth.user.orgId;

    // --- Referential pre-checks (outside tx, all org-scoped) ------------------
    const category = await db.category.findFirst({ where: { id: data.categoryId, orgId } });
    if (!category) return fail("not_found");

    const groupIds = [...new Set(data.modifierGroupIds)];
    if (groupIds.length) {
      const count = await db.modifierGroup.count({ where: { id: { in: groupIds }, orgId } });
      if (count !== groupIds.length) return fail("not_found");
    }

    const comboProductIds = [...new Set(data.comboGroups.flatMap((g) => g.items.map((i) => i.productId)))];
    if (comboProductIds.length) {
      const choices = await db.product.findMany({
        where: { id: { in: comboProductIds }, orgId },
        select: { id: true, type: true },
      });
      if (choices.length !== comboProductIds.length) return fail("not_found");
      if (choices.some((c) => c.type === "combo")) return fail("combo_in_combo");
      if (data.id && comboProductIds.includes(data.id)) return fail("combo_in_combo");
    }

    const ingredientIds = [...new Set(data.recipes.flatMap((r) => r.items.map((i) => i.ingredientId)))];
    const ingredients = ingredientIds.length
      ? await db.ingredient.findMany({ where: { id: { in: ingredientIds }, orgId } })
      : [];
    if (ingredients.length !== ingredientIds.length) return fail("not_found");
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    // Validate recipe units against each ingredient's base unit
    for (const recipe of data.recipes) {
      for (const item of recipe.items) {
        const ing = ingredientById.get(item.ingredientId)!;
        if (!isUnitCompatible(item.displayUnit as DisplayUnit, ing.baseUnit as BaseUnit)) {
          return fail("incompatible_units");
        }
      }
    }

    // Recipes may only reference existing variant ids or "new:N" keys present in payload
    const newKeys = new Set(data.variants.map((_, i) => `new:${i}`));
    const existingVariantIds = new Set(data.variants.map((v) => v.id).filter(Boolean) as string[]);
    for (const recipe of data.recipes) {
      if (recipe.variantKey === null) continue;
      if (!newKeys.has(recipe.variantKey) && !existingVariantIds.has(recipe.variantKey)) {
        return fail("invalid_input");
      }
    }

    const result = await db.$transaction(async (tx) => {
      // --- Product row --------------------------------------------------------
      let productId: string;
      let before: { name: string; sellPrice: number; taxRate: number } | undefined;

      const productData = {
        name: data.name,
        description: data.description ?? null,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl ?? null,
        sku: data.sku ?? null,
        barcode: data.barcode ?? null,
        type: data.type,
        sellPrice: data.sellPrice,
        taxRate: data.taxRatePct,
        costPrice: data.manualCost ?? 0,
        isActive: data.isActive,
        isAvailable: data.isAvailable,
        prepTimeMinutes: data.prepTimeMinutes ?? null,
      };

      if (data.id) {
        const existing = await tx.product.findFirst({ where: { id: data.id, orgId } });
        if (!existing) throw new Error("not_found");
        before = { name: existing.name, sellPrice: existing.sellPrice, taxRate: existing.taxRate };
        await tx.product.update({ where: { id: existing.id }, data: productData });
        productId = existing.id;
      } else {
        const maxSort = await tx.product.aggregate({
          where: { orgId, categoryId: data.categoryId },
          _max: { sortOrder: true },
        });
        const created = await tx.product.create({
          data: { orgId, ...productData, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
        });
        productId = created.id;
      }

      // --- Variants: update by id, create new, delete/deactivate removed -------
      const currentVariants = await tx.productVariant.findMany({ where: { productId } });
      const keptIds = new Set<string>();
      /** payload key ("new:N" or existing id) → real variant id */
      const variantKeyToId = new Map<string, string>();

      for (let i = 0; i < data.variants.length; i++) {
        const v = data.variants[i]!;
        if (v.id && currentVariants.some((c) => c.id === v.id)) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: { name: v.name, priceDelta: v.priceDelta, isDefault: v.isDefault, isActive: v.isActive, sortOrder: i },
          });
          keptIds.add(v.id);
          variantKeyToId.set(v.id, v.id);
        } else {
          const created = await tx.productVariant.create({
            data: { productId, name: v.name, priceDelta: v.priceDelta, isDefault: v.isDefault, isActive: v.isActive, sortOrder: i },
          });
          variantKeyToId.set(`new:${i}`, created.id);
          keptIds.add(created.id);
        }
      }

      for (const current of currentVariants) {
        if (keptIds.has(current.id)) continue;
        const used = await tx.orderItem.count({ where: { variantId: current.id } });
        if (used > 0) {
          await tx.productVariant.update({ where: { id: current.id }, data: { isActive: false } });
        } else {
          await tx.recipe.deleteMany({ where: { variantId: current.id } });
          await tx.productVariant.delete({ where: { id: current.id } });
        }
      }

      // --- Modifier group joins (full replace, order = payload order) ----------
      await tx.productModifierGroup.deleteMany({ where: { productId } });
      if (groupIds.length) {
        await tx.productModifierGroup.createMany({
          data: data.modifierGroupIds.map((gid, i) => ({ productId, groupId: gid, sortOrder: i })),
        });
      }

      // --- Combo groups (full replace — order history uses snapshots) ----------
      await tx.comboGroup.deleteMany({ where: { productId } });
      if (data.type === "combo") {
        for (let gi = 0; gi < data.comboGroups.length; gi++) {
          const g = data.comboGroups[gi]!;
          await tx.comboGroup.create({
            data: {
              productId,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              sortOrder: gi,
              items: {
                create: g.items.map((item, ii) => ({
                  productId: item.productId,
                  priceDelta: item.priceDelta,
                  isDefault: item.isDefault,
                  sortOrder: ii,
                })),
              },
            },
          });
        }
      }

      // --- Recipes (full replace; quantities converted to base units) ----------
      await tx.recipe.deleteMany({ where: { productId } });
      for (const recipe of data.recipes) {
        if (recipe.items.length === 0) continue;
        const variantId = recipe.variantKey === null ? null : variantKeyToId.get(recipe.variantKey);
        if (recipe.variantKey !== null && !variantId) continue; // variant was removed
        await tx.recipe.create({
          data: {
            productId,
            variantId: variantId ?? null,
            items: {
              create: recipe.items.map((item) => {
                const ing = ingredientById.get(item.ingredientId)!;
                void ing;
                return {
                  ingredientId: item.ingredientId,
                  qty: toBaseUnits(item.qty, item.displayUnit as DisplayUnit),
                  displayUnit: item.displayUnit,
                };
              }),
            },
          },
        });
      }

      // --- Audit (price changes are sensitive per spec §27) ---------------------
      await tx.auditLog.create({
        data: {
          orgId,
          userId: auth.user.id,
          action: data.id ? "menu.product_updated" : "menu.product_created",
          entity: "product",
          entityId: productId,
          before: before ? JSON.stringify(before) : null,
          after: JSON.stringify({ name: data.name, sellPrice: data.sellPrice, taxRate: data.taxRatePct }),
        },
      });

      return productId;
    });

    revalidatePath("/menu");
    return ok({ id: result });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && e.message === "not_found") return fail("not_found");
    return fail("generic");
  }
}

/** Quick 86 toggle from the products table. */
export async function toggleProductAvailabilityAction(id: string, isAvailable: boolean): Promise<ActionResult> {
  try {
    const auth = await assertPermission("menu.manage");
    const product = await db.product.findFirst({ where: { id, orgId: auth.user.orgId } });
    if (!product) return fail("not_found");
    await db.product.update({ where: { id }, data: { isAvailable } });
    revalidatePath("/menu");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

/**
 * Delete when never sold & not part of a combo; otherwise deactivate.
 * Order history integrity always wins.
 */
export async function deleteProductAction(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const product = await db.product.findFirst({
      where: { id, orgId: auth.user.orgId },
      include: { _count: { select: { orderItems: true, comboChoices: true } } },
    });
    if (!product) return fail("not_found");

    if (product._count.orderItems > 0 || product._count.comboChoices > 0) {
      await db.product.update({ where: { id }, data: { isActive: false, isAvailable: false } });
      await writeAudit({
        orgId: auth.user.orgId,
        userId: auth.user.id,
        action: "menu.product_deactivated",
        entity: "product",
        entityId: id,
        before: { name: product.name, isActive: true },
        after: { isActive: false },
      });
      revalidatePath("/menu");
      return ok({ deactivated: true });
    }

    await db.$transaction(async (tx) => {
      await tx.recipe.deleteMany({ where: { productId: id } });
      await tx.productModifierGroup.deleteMany({ where: { productId: id } });
      await tx.comboGroup.deleteMany({ where: { productId: id } });
      await tx.productBranch.deleteMany({ where: { productId: id } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "menu.product_deleted",
      entity: "product",
      entityId: id,
      before: { name: product.name },
    });
    revalidatePath("/menu");
    return ok({ deactivated: false });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}
