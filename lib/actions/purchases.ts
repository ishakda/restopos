"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError, type AuthContext } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { applyBasisPoints } from "@/lib/money";
import { moneyString } from "@/lib/validation/menu";
import { stockValueCentimes, weightedAverageCostMilli } from "@/lib/stock";
import { UNIT_FACTORS, isUnitCompatible, toBaseUnits } from "@/lib/units";
import { DISPLAY_UNITS, type BaseUnit } from "@/lib/constants";

function assertBranchAccess(auth: AuthContext, branchId: string) {
  if (auth.user.branchId && auth.user.branchId !== branchId) throw new ForbiddenError("branch");
}

const poLineSchema = z.object({
  ingredientId: z.string().min(1),
  qty: z.coerce.number().gt(0),
  displayUnit: z.enum(DISPLAY_UNITS),
  /** purchase cost per DISPLAY unit, in DA */
  costPerDisplayUnit: moneyString,
  taxRatePct: z.coerce.number().min(0).max(100).default(0),
});

const poSchema = z.object({
  id: z.string().optional(),
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  expectedAt: z.string().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(poLineSchema).min(1).max(100),
});
export type PurchaseOrderInput = z.input<typeof poSchema>;

/** cost per display unit (centimes) → millicentimes per BASE unit. */
function costToMilliPerBase(costCentimes: number, displayUnit: (typeof DISPLAY_UNITS)[number]): number {
  return Math.round((costCentimes * 1000) / UNIT_FACTORS[displayUnit].factor);
}

export async function savePurchaseOrderAction(input: PurchaseOrderInput): Promise<ActionResult<{ id: string; number: string }>> {
  try {
    const auth = await assertPermission("purchases.manage");
    const parsed = poSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    assertBranchAccess(auth, data.branchId);
    const orgId = auth.user.orgId;

    const [branch, supplier, ingredients] = await Promise.all([
      db.branch.findFirst({ where: { id: data.branchId, orgId, isActive: true } }),
      db.supplier.findFirst({ where: { id: data.supplierId, orgId } }),
      db.ingredient.findMany({ where: { id: { in: data.lines.map((l) => l.ingredientId) }, orgId } }),
    ]);
    if (!branch || !supplier) return fail("not_found");
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    // Build validated lines with money in base units
    const builtLines = data.lines.map((line) => {
      const ingredient = ingredientById.get(line.ingredientId);
      if (!ingredient) throw new Error("not_found");
      if (!isUnitCompatible(line.displayUnit, ingredient.baseUnit as BaseUnit)) throw new Error("incompatible_units");
      const qtyBase = toBaseUnits(line.qty, line.displayUnit);
      const unitCostMilli = costToMilliPerBase(line.costPerDisplayUnit, line.displayUnit);
      const lineNet = stockValueCentimes(qtyBase, unitCostMilli);
      const taxBp = Math.round(line.taxRatePct * 100);
      return { ingredientId: ingredient.id, qtyBase, unitCostMilli, displayUnit: line.displayUnit, taxBp, lineNet };
    });

    const subtotal = builtLines.reduce((sum, l) => sum + l.lineNet, 0);
    const taxAmount = builtLines.reduce((sum, l) => sum + applyBasisPoints(l.lineNet, l.taxBp), 0);
    const total = subtotal + taxAmount;
    const expectedAt = data.expectedAt ? new Date(data.expectedAt) : null;

    if (data.id) {
      // Only drafts are editable
      const existing = await db.purchaseOrder.findFirst({ where: { id: data.id, orgId } });
      if (!existing) return fail("not_found");
      if (existing.status !== "draft") return fail("po_not_editable");

      await db.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: existing.id } });
        await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: {
            supplierId: supplier.id,
            expectedAt,
            notes: data.notes ?? null,
            subtotal,
            taxAmount,
            total,
            items: {
              create: builtLines.map((l) => ({
                ingredientId: l.ingredientId,
                qtyOrdered: l.qtyBase,
                unitCostMilli: l.unitCostMilli,
                displayUnit: l.displayUnit,
                taxRate: l.taxBp,
                lineTotal: l.lineNet,
              })),
            },
          },
        });
      });
      revalidatePath("/purchases");
      return ok({ id: existing.id, number: existing.number });
    }

    const created = await db.$transaction(async (tx) => {
      const counter = await tx.orderCounter.upsert({
        where: { branchId_scope_dateKey: { branchId: data.branchId, scope: "po", dateKey: "" } },
        update: { seq: { increment: 1 } },
        create: { branchId: data.branchId, scope: "po", dateKey: "", seq: 1 },
      });
      const number = `PO-${branch.code}-${String(counter.seq).padStart(4, "0")}`;

      const po = await tx.purchaseOrder.create({
        data: {
          orgId,
          branchId: data.branchId,
          supplierId: supplier.id,
          number,
          expectedAt,
          notes: data.notes ?? null,
          subtotal,
          taxAmount,
          total,
          createdById: auth.user.id,
          items: {
            create: builtLines.map((l) => ({
              ingredientId: l.ingredientId,
              qtyOrdered: l.qtyBase,
              unitCostMilli: l.unitCostMilli,
              displayUnit: l.displayUnit,
              taxRate: l.taxBp,
              lineTotal: l.lineNet,
            })),
          },
        },
      });
      await writeAudit(
        {
          orgId,
          branchId: data.branchId,
          userId: auth.user.id,
          action: "purchase.created",
          entity: "purchase_order",
          entityId: po.id,
          after: { number, supplier: supplier.name, total },
        },
        tx
      );
      return po;
    });

    revalidatePath("/purchases");
    return ok({ id: created.id, number: created.number });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && ["not_found", "incompatible_units"].includes(e.message)) return fail(e.message);
    return fail("generic");
  }
}

export async function setPurchaseOrderStatusAction(
  poId: string,
  next: "ordered" | "cancelled"
): Promise<ActionResult> {
  try {
    const auth = await assertPermission("purchases.manage");
    const po = await db.purchaseOrder.findFirst({
      where: { id: poId, orgId: auth.user.orgId },
      include: { items: { select: { qtyReceived: true } } },
    });
    if (!po) return fail("not_found");
    assertBranchAccess(auth, po.branchId);

    if (next === "ordered") {
      if (po.status !== "draft") return fail("invalid_transition");
      await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "ordered", orderedAt: new Date() } });
    } else {
      if (!["draft", "ordered"].includes(po.status)) return fail("invalid_transition");
      if (po.items.some((i) => i.qtyReceived > 0)) return fail("po_has_receipts");
      await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "cancelled" } });
    }

    await writeAudit({
      orgId: auth.user.orgId,
      branchId: po.branchId,
      userId: auth.user.id,
      action: `purchase.${next}`,
      entity: "purchase_order",
      entityId: po.id,
      before: { status: po.status },
      after: { status: next },
    });
    revalidatePath("/purchases");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

const receiveSchema = z.object({
  poId: z.string().min(1),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        /** received NOW, in the line's display unit */
        qty: z.coerce.number().min(0),
      })
    )
    .min(1),
});
export type ReceivePurchaseInput = z.input<typeof receiveSchema>;

/**
 * Receive goods (full or partial — spec §14). In ONE transaction per call:
 * stock increments, purchase movements, weighted-average cost recompute,
 * item received quantities, and the PO status/receivedAt.
 */
export async function receivePurchaseOrderAction(input: ReceivePurchaseInput): Promise<ActionResult> {
  try {
    const auth = await assertPermission("purchases.receive");
    const parsed = receiveSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;

    await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: data.poId, orgId: auth.user.orgId },
        include: { items: { include: { ingredient: true } } },
      });
      if (!po) throw new Error("not_found");
      assertBranchAccess(auth, po.branchId);
      if (!["ordered", "partially_received"].includes(po.status)) throw new Error("invalid_transition");

      const itemById = new Map(po.items.map((i) => [i.id, i]));
      let receivedAnything = false;

      for (const line of data.lines) {
        const item = itemById.get(line.itemId);
        if (!item) throw new Error("not_found");
        if (line.qty <= 0) continue;

        const qtyBase = toBaseUnits(line.qty, item.displayUnit as never);
        const remaining = item.qtyOrdered - item.qtyReceived;
        if (qtyBase > remaining) throw new Error("receive_exceeds_ordered");
        receivedAnything = true;

        // Inventory row + weighted average BEFORE incrementing
        try {
          await tx.inventory.upsert({
            where: { branchId_ingredientId: { branchId: po.branchId, ingredientId: item.ingredientId } },
            update: {},
            create: { branchId: po.branchId, ingredientId: item.ingredientId, qtyOnHand: 0 },
          });
        } catch {
          // concurrent create
        }
        const row = await tx.inventory.findUniqueOrThrow({
          where: { branchId_ingredientId: { branchId: po.branchId, ingredientId: item.ingredientId } },
        });

        const newAvg = weightedAverageCostMilli(
          row.qtyOnHand,
          item.ingredient.avgCostMilli,
          qtyBase,
          item.unitCostMilli
        );

        await tx.inventory.update({
          where: { branchId_ingredientId: { branchId: po.branchId, ingredientId: item.ingredientId } },
          data: { qtyOnHand: { increment: qtyBase } },
        });
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: { avgCostMilli: newAvg, lastCostMilli: item.unitCostMilli },
        });
        await tx.stockMovement.create({
          data: {
            orgId: auth.user.orgId,
            branchId: po.branchId,
            ingredientId: item.ingredientId,
            type: "purchase",
            qtyBefore: row.qtyOnHand,
            qtyChange: qtyBase,
            qtyAfter: row.qtyOnHand + qtyBase,
            unitCostMilli: item.unitCostMilli,
            totalCostCentimes: stockValueCentimes(qtyBase, item.unitCostMilli),
            userId: auth.user.id,
            purchaseOrderId: po.id,
            reference: po.number,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { qtyReceived: { increment: qtyBase } },
        });
        item.qtyReceived += qtyBase; // keep local copy in sync for status calc
      }

      if (!receivedAnything) throw new Error("invalid_input");

      const fullyReceived = po.items.every((i) => i.qtyReceived >= i.qtyOrdered);
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: fullyReceived ? "received" : "partially_received",
          ...(fullyReceived ? { receivedAt: new Date() } : {}),
        },
      });

      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: po.branchId,
          userId: auth.user.id,
          action: "purchase.received",
          entity: "purchase_order",
          entityId: po.id,
          after: { number: po.number, fullyReceived },
        },
        tx
      );
    });

    revalidatePath("/purchases");
    revalidatePath("/inventory");
    revalidatePath("/ingredients");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && ["not_found", "invalid_transition", "receive_exceeds_ordered", "invalid_input"].includes(e.message)) {
      return fail(e.message);
    }
    return fail("generic");
  }
}
