"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { emitOrderEvent } from "@/lib/events";
import { assertAnyPermission, assertPermission, ForbiddenError, type AuthContext } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getSettings } from "@/lib/settings";
import { stockValueCentimes } from "@/lib/stock";
import { isUnitCompatible, toBaseUnits } from "@/lib/units";
import { DISPLAY_UNITS, WASTE_REASONS, type BaseUnit, type DisplayUnit } from "@/lib/constants";

function assertBranchAccess(auth: AuthContext, branchId: string) {
  if (auth.user.branchId && auth.user.branchId !== branchId) throw new ForbiddenError("branch");
}

async function ensureInventoryRow(branchId: string, ingredientId: string) {
  try {
    await db.inventory.upsert({
      where: { branchId_ingredientId: { branchId, ingredientId } },
      update: {},
      create: { branchId, ingredientId, qtyOnHand: 0 },
    });
  } catch {
    // concurrent create — fine
  }
}

// ---------------------------------------------------------------------------
// Physical count adjustment
// ---------------------------------------------------------------------------

const adjustSchema = z.object({
  branchId: z.string().min(1),
  ingredientId: z.string().min(1),
  /** counted PHYSICAL quantity, in the given display unit */
  countedQty: z.coerce.number().min(0),
  displayUnit: z.enum(DISPLAY_UNITS),
  reason: z.string().trim().min(2).max(200),
});

export async function adjustStockAction(input: z.input<typeof adjustSchema>): Promise<ActionResult> {
  try {
    const auth = await assertPermission("inventory.adjust");
    const parsed = adjustSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    assertBranchAccess(auth, data.branchId);

    const ingredient = await db.ingredient.findFirst({
      where: { id: data.ingredientId, orgId: auth.user.orgId },
    });
    if (!ingredient) return fail("not_found");
    if (!isUnitCompatible(data.displayUnit, ingredient.baseUnit as BaseUnit)) return fail("incompatible_units");
    const countedBase = toBaseUnits(data.countedQty, data.displayUnit);

    await ensureInventoryRow(data.branchId, data.ingredientId);

    const result = await db.$transaction(async (tx) => {
      const row = await tx.inventory.findUniqueOrThrow({
        where: { branchId_ingredientId: { branchId: data.branchId, ingredientId: data.ingredientId } },
      });
      const delta = countedBase - row.qtyOnHand;
      if (delta === 0) return { delta: 0 };

      // Optimistic concurrency: only apply if the quantity is still what we read
      const updated = await tx.inventory.updateMany({
        where: { branchId: data.branchId, ingredientId: data.ingredientId, qtyOnHand: row.qtyOnHand },
        data: { qtyOnHand: countedBase },
      });
      if (updated.count === 0) throw new Error("conflict");

      await tx.stockMovement.create({
        data: {
          orgId: auth.user.orgId,
          branchId: data.branchId,
          ingredientId: data.ingredientId,
          type: "adjustment",
          qtyBefore: row.qtyOnHand,
          qtyChange: delta,
          qtyAfter: countedBase,
          unitCostMilli: ingredient.avgCostMilli,
          totalCostCentimes: stockValueCentimes(Math.abs(delta), ingredient.avgCostMilli),
          userId: auth.user.id,
          reason: data.reason,
        },
      });
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: data.branchId,
          userId: auth.user.id,
          action: "stock.adjusted",
          entity: "ingredient",
          entityId: ingredient.id,
          before: { qty: row.qtyOnHand },
          after: { qty: countedBase, reason: data.reason },
        },
        tx
      );
      return { delta };
    });

    void result;
    revalidatePath("/inventory");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && e.message === "conflict") return fail("stock_conflict");
    return fail("generic");
  }
}

// ---------------------------------------------------------------------------
// Thresholds & storage location
// ---------------------------------------------------------------------------

const metaSchema = z.object({
  branchId: z.string().min(1),
  ingredientId: z.string().min(1),
  minQty: z.coerce.number().min(0),
  displayUnit: z.enum(DISPLAY_UNITS),
  storageLocation: z.string().trim().max(60).optional().nullable(),
});

export async function updateInventoryMetaAction(input: z.input<typeof metaSchema>): Promise<ActionResult> {
  try {
    const auth = await assertAnyPermission(["inventory.adjust", "inventory.view"]);
    const parsed = metaSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    assertBranchAccess(auth, data.branchId);

    const ingredient = await db.ingredient.findFirst({
      where: { id: data.ingredientId, orgId: auth.user.orgId },
    });
    if (!ingredient) return fail("not_found");
    if (!isUnitCompatible(data.displayUnit, ingredient.baseUnit as BaseUnit)) return fail("incompatible_units");

    await ensureInventoryRow(data.branchId, data.ingredientId);
    await db.inventory.update({
      where: { branchId_ingredientId: { branchId: data.branchId, ingredientId: data.ingredientId } },
      data: {
        minQty: toBaseUnits(data.minQty, data.displayUnit),
        storageLocation: data.storageLocation?.trim() || null,
      },
    });
    revalidatePath("/inventory");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

// ---------------------------------------------------------------------------
// Inter-branch transfer
// ---------------------------------------------------------------------------

const transferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  ingredientId: z.string().min(1),
  qty: z.coerce.number().gt(0),
  displayUnit: z.enum(DISPLAY_UNITS),
  notes: z.string().trim().max(200).optional().nullable(),
});

export async function transferStockAction(input: z.input<typeof transferSchema>): Promise<ActionResult> {
  try {
    const auth = await assertPermission("inventory.transfer");
    const parsed = transferSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    if (data.fromBranchId === data.toBranchId) return fail("invalid_input");
    assertBranchAccess(auth, data.fromBranchId);

    const [ingredient, from, to] = await Promise.all([
      db.ingredient.findFirst({ where: { id: data.ingredientId, orgId: auth.user.orgId } }),
      db.branch.findFirst({ where: { id: data.fromBranchId, orgId: auth.user.orgId, isActive: true } }),
      db.branch.findFirst({ where: { id: data.toBranchId, orgId: auth.user.orgId, isActive: true } }),
    ]);
    if (!ingredient || !from || !to) return fail("not_found");
    if (!isUnitCompatible(data.displayUnit, ingredient.baseUnit as BaseUnit)) return fail("incompatible_units");
    const qtyBase = toBaseUnits(data.qty, data.displayUnit);

    await ensureInventoryRow(data.fromBranchId, data.ingredientId);
    await ensureInventoryRow(data.toBranchId, data.ingredientId);

    await db.$transaction(async (tx) => {
      // Transfers can never make the source negative — atomic guard
      const updated = await tx.inventory.updateMany({
        where: { branchId: data.fromBranchId, ingredientId: data.ingredientId, qtyOnHand: { gte: qtyBase } },
        data: { qtyOnHand: { decrement: qtyBase } },
      });
      if (updated.count === 0) throw new Error("insufficient_stock");

      await tx.inventory.updateMany({
        where: { branchId: data.toBranchId, ingredientId: data.ingredientId },
        data: { qtyOnHand: { increment: qtyBase } },
      });

      const [fromRow, toRow] = await Promise.all([
        tx.inventory.findUniqueOrThrow({
          where: { branchId_ingredientId: { branchId: data.fromBranchId, ingredientId: data.ingredientId } },
        }),
        tx.inventory.findUniqueOrThrow({
          where: { branchId_ingredientId: { branchId: data.toBranchId, ingredientId: data.ingredientId } },
        }),
      ]);

      const value = stockValueCentimes(qtyBase, ingredient.avgCostMilli);
      await tx.stockMovement.create({
        data: {
          orgId: auth.user.orgId,
          branchId: data.fromBranchId,
          ingredientId: data.ingredientId,
          type: "transfer_out",
          qtyBefore: fromRow.qtyOnHand + qtyBase,
          qtyChange: -qtyBase,
          qtyAfter: fromRow.qtyOnHand,
          unitCostMilli: ingredient.avgCostMilli,
          totalCostCentimes: value,
          userId: auth.user.id,
          reference: `→ ${to.name}`,
          notes: data.notes ?? null,
        },
      });
      await tx.stockMovement.create({
        data: {
          orgId: auth.user.orgId,
          branchId: data.toBranchId,
          ingredientId: data.ingredientId,
          type: "transfer_in",
          qtyBefore: toRow.qtyOnHand - qtyBase,
          qtyChange: qtyBase,
          qtyAfter: toRow.qtyOnHand,
          unitCostMilli: ingredient.avgCostMilli,
          totalCostCentimes: value,
          userId: auth.user.id,
          reference: `← ${from.name}`,
          notes: data.notes ?? null,
        },
      });
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: data.fromBranchId,
          userId: auth.user.id,
          action: "stock.transferred",
          entity: "ingredient",
          entityId: ingredient.id,
          after: { qty: qtyBase, from: from.name, to: to.name },
        },
        tx
      );
    });

    revalidatePath("/inventory");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && e.message === "insufficient_stock") return fail("insufficient_stock");
    return fail("generic");
  }
}

// ---------------------------------------------------------------------------
// Waste
// ---------------------------------------------------------------------------

const wasteSchema = z.object({
  branchId: z.string().min(1),
  ingredientId: z.string().min(1),
  qty: z.coerce.number().gt(0),
  displayUnit: z.enum(DISPLAY_UNITS),
  reason: z.enum(WASTE_REASONS),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function recordWasteAction(input: z.input<typeof wasteSchema>): Promise<ActionResult> {
  try {
    const auth = await assertAnyPermission(["waste.create"]);
    const parsed = wasteSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    assertBranchAccess(auth, data.branchId);

    const [ingredient, settings] = await Promise.all([
      db.ingredient.findFirst({ where: { id: data.ingredientId, orgId: auth.user.orgId } }),
      getSettings(auth.user.orgId, data.branchId),
    ]);
    if (!ingredient) return fail("not_found");
    if (!isUnitCompatible(data.displayUnit, ingredient.baseUnit as BaseUnit)) return fail("incompatible_units");
    const qtyBase = toBaseUnits(data.qty, data.displayUnit);
    const policy = settings["stock.negativePolicy"];

    await ensureInventoryRow(data.branchId, data.ingredientId);

    let alert: { name: string; out: boolean } | null = null;
    await db.$transaction(async (tx) => {
      const updated = await tx.inventory.updateMany({
        where: {
          branchId: data.branchId,
          ingredientId: data.ingredientId,
          ...(policy === "block" ? { qtyOnHand: { gte: qtyBase } } : {}),
        },
        data: { qtyOnHand: { decrement: qtyBase } },
      });
      if (updated.count === 0) throw new Error("insufficient_stock");

      const row = await tx.inventory.findUniqueOrThrow({
        where: { branchId_ingredientId: { branchId: data.branchId, ingredientId: data.ingredientId } },
      });
      const costCentimes = stockValueCentimes(qtyBase, ingredient.avgCostMilli);

      const waste = await tx.wasteRecord.create({
        data: {
          orgId: auth.user.orgId,
          branchId: data.branchId,
          ingredientId: data.ingredientId,
          qty: qtyBase,
          reason: data.reason,
          costCentimes,
          userId: auth.user.id,
          notes: data.notes ?? null,
        },
      });
      await tx.stockMovement.create({
        data: {
          orgId: auth.user.orgId,
          branchId: data.branchId,
          ingredientId: data.ingredientId,
          type: "waste",
          qtyBefore: row.qtyOnHand + qtyBase,
          qtyChange: -qtyBase,
          qtyAfter: row.qtyOnHand,
          unitCostMilli: ingredient.avgCostMilli,
          totalCostCentimes: costCentimes,
          userId: auth.user.id,
          wasteRecordId: waste.id,
          reason: data.reason,
        },
      });
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: data.branchId,
          userId: auth.user.id,
          action: "stock.waste_recorded",
          entity: "ingredient",
          entityId: ingredient.id,
          after: { qty: qtyBase, reason: data.reason, costCentimes },
        },
        tx
      );

      if (row.qtyOnHand <= 0) alert = { name: ingredient.name, out: true };
      else if (row.minQty > 0 && row.qtyOnHand <= row.minQty) alert = { name: ingredient.name, out: false };
    });

    if (alert !== null) {
      const a = alert as { name: string; out: boolean };
      emitOrderEvent({
        type: "stock.alert",
        branchId: data.branchId,
        label: a.name,
        status: a.out ? "out" : "low",
      });
    }
    revalidatePath("/inventory");
    revalidatePath("/waste");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && e.message === "insufficient_stock") return fail("insufficient_stock");
    return fail("generic");
  }
}

/** Local type re-export for the UI (display units already validated). */
export type WasteReasonInput = z.input<typeof wasteSchema>;
export type AdjustInput = z.input<typeof adjustSchema>;
export type TransferInput = z.input<typeof transferSchema>;
export type InventoryMetaInput = z.input<typeof metaSchema>;
export type WasteDisplayUnit = DisplayUnit;
