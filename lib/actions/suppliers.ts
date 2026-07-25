"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { moneyString } from "@/lib/validation/menu";

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  contactName: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal("").transform(() => null)),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export async function saveSupplierAction(input: SupplierInput): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await assertPermission("suppliers.manage");
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;

    const payload = {
      name: data.name,
      contactName: data.contactName ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive,
    };

    if (data.id) {
      const existing = await db.supplier.findFirst({ where: { id: data.id, orgId: auth.user.orgId } });
      if (!existing) return fail("not_found");
      const updated = await db.supplier.update({ where: { id: existing.id }, data: payload });
      revalidatePath("/suppliers");
      return ok({ id: updated.id });
    }

    const created = await db.supplier.create({ data: { orgId: auth.user.orgId, ...payload } });
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "supplier.created",
      entity: "supplier",
      entityId: created.id,
      after: { name: created.name },
    });
    revalidatePath("/suppliers");
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const auth = await assertPermission("suppliers.manage");
    const supplier = await db.supplier.findFirst({
      where: { id, orgId: auth.user.orgId },
      include: { _count: { select: { purchaseOrders: true, payments: true, ingredients: true } } },
    });
    if (!supplier) return fail("not_found");

    const refs = supplier._count.purchaseOrders + supplier._count.payments + supplier._count.ingredients;
    if (refs > 0) {
      await db.supplier.update({ where: { id }, data: { isActive: false } });
      revalidatePath("/suppliers");
      return ok({ deactivated: true });
    }
    await db.supplier.delete({ where: { id } });
    revalidatePath("/suppliers");
    return ok({ deactivated: false });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  purchaseOrderId: z.string().optional().nullable(),
  amount: moneyString,
  method: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(300).optional().nullable(),
});
export type SupplierPaymentInput = z.input<typeof supplierPaymentSchema>;

export async function paySupplierAction(input: SupplierPaymentInput): Promise<ActionResult> {
  try {
    const auth = await assertPermission("suppliers.pay");
    const parsed = supplierPaymentSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    if (data.amount <= 0) return fail("invalid_input");

    await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, orgId: auth.user.orgId } });
      if (!supplier) throw new Error("not_found");

      let purchaseOrderId: string | null = null;
      if (data.purchaseOrderId) {
        const po = await tx.purchaseOrder.findFirst({
          where: { id: data.purchaseOrderId, orgId: auth.user.orgId, supplierId: supplier.id },
        });
        if (!po) throw new Error("not_found");
        purchaseOrderId = po.id;
        const amountPaid = po.amountPaid + data.amount;
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: {
            amountPaid,
            paymentStatus: amountPaid >= po.total ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
          },
        });
      }

      await tx.supplierPayment.create({
        data: {
          orgId: auth.user.orgId,
          supplierId: supplier.id,
          purchaseOrderId,
          amount: data.amount,
          method: data.method,
          notes: data.notes ?? null,
          userId: auth.user.id,
        },
      });
      await writeAudit(
        {
          orgId: auth.user.orgId,
          userId: auth.user.id,
          action: "supplier.payment",
          entity: "supplier",
          entityId: supplier.id,
          after: { amount: data.amount, method: data.method, purchaseOrderId },
        },
        tx
      );
    });

    revalidatePath("/suppliers");
    revalidatePath("/purchases");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && e.message === "not_found") return fail("not_found");
    return fail("generic");
  }
}
