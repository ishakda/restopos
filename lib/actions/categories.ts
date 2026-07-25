"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { categorySchema, type CategoryInput } from "@/lib/validation/menu";

export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertPermission("menu.manage");
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;

    if (data.id) {
      const existing = await db.category.findFirst({ where: { id: data.id, orgId: auth.user.orgId } });
      if (!existing) return fail("not_found");
      const updated = await db.category.update({
        where: { id: existing.id },
        data: { name: data.name, imageUrl: data.imageUrl ?? null, isActive: data.isActive },
      });
      await writeAudit({
        orgId: auth.user.orgId,
        userId: auth.user.id,
        action: "menu.category_updated",
        entity: "category",
        entityId: updated.id,
        before: { name: existing.name, isActive: existing.isActive },
        after: { name: updated.name, isActive: updated.isActive },
      });
      revalidatePath("/menu");
      return ok({ id: updated.id });
    }

    const maxSort = await db.category.aggregate({
      where: { orgId: auth.user.orgId },
      _max: { sortOrder: true },
    });
    const created = await db.category.create({
      data: {
        orgId: auth.user.orgId,
        name: data.name,
        imageUrl: data.imageUrl ?? null,
        isActive: data.isActive,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "menu.category_created",
      entity: "category",
      entityId: created.id,
      after: { name: created.name },
    });
    revalidatePath("/menu");
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    const auth = await assertPermission("menu.manage");
    const category = await db.category.findFirst({
      where: { id, orgId: auth.user.orgId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) return fail("not_found");
    if (category._count.products > 0) return fail("category_has_products");

    await db.printerCategory.deleteMany({ where: { categoryId: id } });
    await db.category.delete({ where: { id } });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "menu.category_deleted",
      entity: "category",
      entityId: id,
      before: { name: category.name },
    });
    revalidatePath("/menu");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

/** Swap sortOrder with the neighbor above/below. */
export async function moveCategoryAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    const auth = await assertPermission("menu.manage");
    const all = await db.category.findMany({
      where: { orgId: auth.user.orgId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) return fail("not_found");
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= all.length) return ok();

    const a = all[idx]!;
    const b = all[swapWith]!;
    await db.$transaction([
      db.category.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
      db.category.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
    ]);
    revalidatePath("/menu");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}
