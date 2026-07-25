"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError, type AuthContext } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { tableSchema, type TableInput } from "@/lib/validation/orders";

function assertBranchAccess(auth: AuthContext, branchId: string) {
  if (auth.user.branchId && auth.user.branchId !== branchId) throw new ForbiddenError("branch");
}

export async function saveTableAction(branchId: string, input: TableInput): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertPermission("tables.edit_floor");
    assertBranchAccess(auth, branchId);
    const branch = await db.branch.findFirst({ where: { id: branchId, orgId: auth.user.orgId } });
    if (!branch) return fail("not_found");

    const parsed = tableSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;

    const duplicate = await db.restaurantTable.findFirst({
      where: { branchId, name: data.name, ...(data.id ? { id: { not: data.id } } : {}) },
    });
    if (duplicate) return fail("table_name_taken");

    if (data.id) {
      const existing = await db.restaurantTable.findFirst({ where: { id: data.id, branchId } });
      if (!existing) return fail("not_found");
      const updated = await db.restaurantTable.update({
        where: { id: existing.id },
        data: { name: data.name, seats: data.seats, zone: data.zone?.trim() || null, isActive: data.isActive },
      });
      revalidatePath("/tables");
      return ok({ id: updated.id });
    }

    const created = await db.restaurantTable.create({
      data: { branchId, name: data.name, seats: data.seats, zone: data.zone?.trim() || null },
    });
    await writeAudit({
      orgId: auth.user.orgId,
      branchId,
      userId: auth.user.id,
      action: "table.created",
      entity: "table",
      entityId: created.id,
      after: { name: created.name },
    });
    revalidatePath("/tables");
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function deleteTableAction(tableId: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const auth = await assertPermission("tables.edit_floor");
    const table = await db.restaurantTable.findFirst({
      where: { id: tableId, branch: { orgId: auth.user.orgId } },
      include: { _count: { select: { orders: true } } },
    });
    if (!table) return fail("not_found");
    assertBranchAccess(auth, table.branchId);

    if (table._count.orders > 0) {
      await db.restaurantTable.update({ where: { id: tableId }, data: { isActive: false } });
      revalidatePath("/tables");
      return ok({ deactivated: true });
    }
    await db.restaurantTable.delete({ where: { id: tableId } });
    revalidatePath("/tables");
    return ok({ deactivated: false });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

/** Manual floor states: available / reserved / cleaning (no open order). */
export async function setTableStatusAction(
  tableId: string,
  status: "available" | "reserved" | "cleaning"
): Promise<ActionResult> {
  try {
    const auth = await assertPermission("tables.manage");
    const table = await db.restaurantTable.findFirst({
      where: { id: tableId, branch: { orgId: auth.user.orgId } },
    });
    if (!table) return fail("not_found");
    assertBranchAccess(auth, table.branchId);

    const openOrders = await db.order.count({
      where: {
        tableId,
        status: { in: ["new", "confirmed", "preparing", "ready", "served", "out_for_delivery"] },
      },
    });
    if (openOrders > 0) return fail("table_has_open_order");

    await db.restaurantTable.update({ where: { id: tableId }, data: { status } });
    revalidatePath("/tables");
    revalidatePath("/pos");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}
