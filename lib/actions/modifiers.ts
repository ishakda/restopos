"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { modifierGroupSchema, modifierSchema, type ModifierGroupInput, type ModifierInput } from "@/lib/validation/menu";
import { isUnitCompatible, toBaseUnits } from "@/lib/units";
import type { DisplayUnit } from "@/lib/constants";

export async function saveModifierGroupAction(input: ModifierGroupInput): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const parsed = modifierGroupSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    if (data.maxSelect !== 0 && data.maxSelect < data.minSelect) return fail("max_lt_min");

    if (data.id) {
      const existing = await db.modifierGroup.findFirst({ where: { id: data.id, orgId: auth.user.orgId } });
      if (!existing) return fail("not_found");
      const updated = await db.modifierGroup.update({
        where: { id: existing.id },
        data: { name: data.name, minSelect: data.minSelect, maxSelect: data.maxSelect, isActive: data.isActive },
      });
      revalidatePath("/menu/modifiers");
      return ok({ id: updated.id });
    }

    const maxSort = await db.modifierGroup.aggregate({ where: { orgId: auth.user.orgId }, _max: { sortOrder: true } });
    const created = await db.modifierGroup.create({
      data: {
        orgId: auth.user.orgId,
        name: data.name,
        minSelect: data.minSelect,
        maxSelect: data.maxSelect,
        isActive: data.isActive,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "menu.modifier_group_created",
      entity: "modifier_group",
      entityId: created.id,
      after: { name: created.name },
    });
    revalidatePath("/menu/modifiers");
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function deleteModifierGroupAction(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const group = await db.modifierGroup.findFirst({
      where: { id, orgId: auth.user.orgId },
      include: { modifiers: { select: { id: true } }, _count: { select: { products: true } } },
    });
    if (!group) return fail("not_found");

    const modifierIds = group.modifiers.map((m) => m.id);
    const usedByOrders = modifierIds.length
      ? await db.orderItemModifier.count({ where: { modifierId: { in: modifierIds } } })
      : 0;

    if (usedByOrders > 0) {
      await db.modifierGroup.update({ where: { id }, data: { isActive: false } });
      revalidatePath("/menu/modifiers");
      return ok({ deactivated: true });
    }

    await db.modifierGroup.delete({ where: { id } }); // cascades modifiers + product joins
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "menu.modifier_group_deleted",
      entity: "modifier_group",
      entityId: id,
      before: { name: group.name },
    });
    revalidatePath("/menu/modifiers");
    return ok({ deactivated: false });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function saveModifierAction(input: ModifierInput): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const parsed = modifierSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;

    const group = await db.modifierGroup.findFirst({ where: { id: data.groupId, orgId: auth.user.orgId } });
    if (!group) return fail("not_found");

    // Optional ingredient consumption link
    let ingredientId: string | null = null;
    let ingredientQty: number | null = null;
    if (data.ingredientId) {
      const ingredient = await db.ingredient.findFirst({
        where: { id: data.ingredientId, orgId: auth.user.orgId },
      });
      if (!ingredient) return fail("not_found");
      const unit = (data.ingredientQtyUnit ?? ingredient.displayUnit) as DisplayUnit;
      if (!isUnitCompatible(unit, ingredient.baseUnit as never)) return fail("incompatible_units");
      if (!data.ingredientQty || data.ingredientQty <= 0) return fail("invalid_input");
      ingredientId = ingredient.id;
      ingredientQty = toBaseUnits(data.ingredientQty, unit);
    }

    if (data.id) {
      const existing = await db.modifier.findFirst({
        where: { id: data.id, group: { orgId: auth.user.orgId } },
      });
      if (!existing) return fail("not_found");
      const updated = await db.modifier.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          priceDelta: data.priceDelta,
          ingredientId,
          ingredientQty,
          isActive: data.isActive,
          groupId: group.id,
        },
      });
      revalidatePath("/menu/modifiers");
      return ok({ id: updated.id });
    }

    const maxSort = await db.modifier.aggregate({ where: { groupId: group.id }, _max: { sortOrder: true } });
    const created = await db.modifier.create({
      data: {
        groupId: group.id,
        name: data.name,
        priceDelta: data.priceDelta,
        ingredientId,
        ingredientQty,
        isActive: data.isActive,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    revalidatePath("/menu/modifiers");
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function deleteModifierAction(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const modifier = await db.modifier.findFirst({
      where: { id, group: { orgId: auth.user.orgId } },
      include: { _count: { select: { orderItemModifiers: true } } },
    });
    if (!modifier) return fail("not_found");

    if (modifier._count.orderItemModifiers > 0) {
      await db.modifier.update({ where: { id }, data: { isActive: false } });
      revalidatePath("/menu/modifiers");
      return ok({ deactivated: true });
    }
    await db.modifier.delete({ where: { id } });
    revalidatePath("/menu/modifiers");
    return ok({ deactivated: false });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}
