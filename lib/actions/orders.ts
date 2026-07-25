"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError, type AuthContext } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  cancelOrderSchema,
  createOrderSchema,
  type CancelOrderInput,
  type CreateOrderInput,
} from "@/lib/validation/orders";
import {
  computeOrderTotals,
  lineTotal,
  lineUnitPrice,
  remainingDue,
  type OrderLineInput,
} from "@/lib/order-math";
import { canTransition, isOpenStatus } from "@/lib/order-status";
import { dateKeyFor } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { ORDER_NUMBER_PREFIX, type OrderStatus, type OrderType } from "@/lib/constants";

function assertBranchAccess(auth: AuthContext, branchId: string) {
  if (auth.user.branchId && auth.user.branchId !== branchId) {
    throw new ForbiddenError("branch");
  }
}

function revalidateOps() {
  revalidatePath("/orders");
  revalidatePath("/tables");
  revalidatePath("/pos");
}

/** Free a table unless another open order still occupies it. */
async function releaseTable(tx: Prisma.TransactionClient, tableId: string, exceptOrderId: string) {
  const stillOpen = await tx.order.count({
    where: {
      tableId,
      id: { not: exceptOrderId },
      status: { in: ["new", "confirmed", "preparing", "ready", "served", "out_for_delivery"] },
    },
  });
  if (stillOpen === 0) {
    await tx.restaurantTable.update({ where: { id: tableId }, data: { status: "cleaning" } });
  }
}

/** Rebuild an order's money fields from its stored item snapshots. */
async function recomputeOrderTotals(
  tx: Prisma.TransactionClient,
  orderId: string,
  taxMode: "inclusive" | "exclusive"
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { where: { parentItemId: null, status: { not: "cancelled" } } } },
  });
  const lines: OrderLineInput[] = order.items.map((item) => ({
    unitPrice: item.unitPrice,
    qty: item.qty,
    taxRateBp: item.taxRate,
    modifiersDelta: Math.round(item.lineSubtotal / item.qty) - item.unitPrice,
  }));
  const totals = computeOrderTotals({
    lines,
    discount: order.discountAmount > 0 ? { kind: "fixed", value: order.discountAmount } : null,
    deliveryFee: order.deliveryFee,
    taxMode,
  });
  await tx.order.update({
    where: { id: orderId },
    data: {
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      paymentStatus:
        order.paidAmount <= 0 ? "unpaid" : order.paidAmount >= totals.total ? "paid" : "partial",
      version: { increment: 1 },
    },
  });
  return totals;
}

// ---------------------------------------------------------------------------
// CREATE ORDER — server is the only price authority
// ---------------------------------------------------------------------------

export interface CreatedOrderSummary {
  id: string;
  number: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryFee: number;
}

export async function createOrderAction(
  branchId: string,
  input: CreateOrderInput
): Promise<ActionResult<CreatedOrderSummary>> {
  try {
    const auth = await assertPermission("orders.create");
    assertBranchAccess(auth, branchId);
    const orgId = auth.user.orgId;

    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message === "table_required" || issue?.message === "phone_required" || issue?.message === "address_required" ? issue.message : "invalid_input");
    }
    const data = parsed.data;

    // Idempotency short-circuit
    const existing = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
    if (existing) {
      return ok({
        id: existing.id,
        number: existing.number,
        total: existing.total,
        subtotal: existing.subtotal,
        discountAmount: existing.discountAmount,
        taxAmount: existing.taxAmount,
        deliveryFee: existing.deliveryFee,
      });
    }

    const [org, branch, settings] = await Promise.all([
      db.organization.findUniqueOrThrow({ where: { id: orgId } }),
      db.branch.findFirst({ where: { id: branchId, orgId, isActive: true } }),
      getSettings(orgId, branchId),
    ]);
    if (!branch) return fail("not_found");

    // --- Load & validate catalog data ---------------------------------------
    const productIds = [
      ...new Set([
        ...data.items.map((i) => i.productId),
        ...data.items.flatMap((i) => (i.comboSelections ?? []).map((s) => s.productId)),
      ]),
    ];
    const products = await db.product.findMany({
      where: { id: { in: productIds }, orgId },
      include: {
        variants: true,
        modifierGroups: { include: { group: { include: { modifiers: true } } } },
        comboGroups: { include: { items: true } },
        branches: { where: { branchId } },
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    interface BuiltItem {
      productId: string;
      variantId: string | null;
      nameSnapshot: string;
      variantNameSnapshot: string | null;
      unitPrice: number;
      qty: number;
      taxRate: number;
      notes: string | null;
      modifiers: { modifierId: string; nameSnapshot: string; priceDelta: number; ingredientId: string | null; ingredientQty: number | null }[];
      children: { productId: string; comboGroupId: string; nameSnapshot: string; qty: number }[];
      line: OrderLineInput;
    }

    const built: BuiltItem[] = [];

    for (const item of data.items) {
      const product = productById.get(item.productId);
      if (!product || !product.isActive) return fail("product_unavailable");
      const override = product.branches[0];
      if (!product.isAvailable || override?.isAvailable === false) return fail("product_unavailable");

      const basePrice = override?.priceOverride ?? product.sellPrice;

      // Variant
      let variantDelta = 0;
      let variantName: string | null = null;
      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId && v.isActive);
        if (!variant) return fail("invalid_input");
        variantDelta = variant.priceDelta;
        variantName = variant.name;
      } else if (product.variants.some((v) => v.isActive)) {
        const def = product.variants.find((v) => v.isDefault && v.isActive) ?? product.variants.find((v) => v.isActive);
        if (def) {
          variantDelta = def.priceDelta;
          variantName = def.name;
          item.variantId = def.id;
        }
      }

      // Modifiers (validated against attached, active groups)
      const attachedGroups = product.modifierGroups
        .map((pg) => pg.group)
        .filter((g) => g.isActive);
      const allowedModifiers = new Map(
        attachedGroups.flatMap((g) => g.modifiers.filter((m) => m.isActive).map((m) => [m.id, { ...m, groupId: g.id }] as const))
      );
      const selectedByGroup = new Map<string, number>();
      const builtModifiers: BuiltItem["modifiers"] = [];
      let modifiersDelta = 0;
      for (const modifierId of item.modifierIds ?? []) {
        const modifier = allowedModifiers.get(modifierId);
        if (!modifier) return fail("modifiers_invalid");
        selectedByGroup.set(modifier.groupId, (selectedByGroup.get(modifier.groupId) ?? 0) + 1);
        modifiersDelta += modifier.priceDelta;
        builtModifiers.push({
          modifierId: modifier.id,
          nameSnapshot: modifier.name,
          priceDelta: modifier.priceDelta,
          ingredientId: modifier.ingredientId,
          ingredientQty: modifier.ingredientQty,
        });
      }
      for (const group of attachedGroups) {
        const count = selectedByGroup.get(group.id) ?? 0;
        if (count < group.minSelect) return fail("modifiers_invalid");
        if (group.maxSelect > 0 && count > group.maxSelect) return fail("modifiers_invalid");
      }

      // Combo
      let comboDelta = 0;
      const children: BuiltItem["children"] = [];
      if (product.type === "combo") {
        for (const group of product.comboGroups) {
          const selections = (item.comboSelections ?? []).filter((s) => s.comboGroupId === group.id);
          if (selections.length < group.minSelect || selections.length > group.maxSelect) {
            return fail("combo_invalid");
          }
          for (const selection of selections) {
            const choice = group.items.find((ci) => ci.productId === selection.productId);
            if (!choice) return fail("combo_invalid");
            const choiceProduct = productById.get(choice.productId);
            if (!choiceProduct || !choiceProduct.isActive) return fail("product_unavailable");
            comboDelta += choice.priceDelta;
            children.push({
              productId: choice.productId,
              comboGroupId: group.id,
              nameSnapshot: choiceProduct.name,
              qty: item.qty,
            });
          }
        }
      } else if ((item.comboSelections ?? []).length > 0) {
        return fail("invalid_input");
      }

      const unitPrice = basePrice + variantDelta + comboDelta;
      built.push({
        productId: product.id,
        variantId: item.variantId ?? null,
        nameSnapshot: product.name,
        variantNameSnapshot: variantName,
        unitPrice,
        qty: item.qty,
        taxRate: product.taxRate,
        notes: item.notes?.trim() || null,
        modifiers: builtModifiers,
        children,
        line: { unitPrice, qty: item.qty, taxRateBp: product.taxRate, modifiersDelta },
      });
    }

    // --- Discount -------------------------------------------------------------
    let discount: { kind: "percent" | "fixed"; value: number } | null = null;
    if (data.discount) {
      if (!auth.permissions.has("orders.discount")) return fail("forbidden");
      if (data.discount.kind === "percent") {
        discount = { kind: "percent", value: Math.round((data.discount.percentValue ?? 0) * 100) };
      } else {
        discount = { kind: "fixed", value: data.discount.fixedValue ?? 0 };
      }
    }

    // --- Type-specific requirements -------------------------------------------
    let deliveryFee = 0;
    if (data.type === "delivery" && data.deliveryZoneId) {
      const zone = await db.deliveryZone.findFirst({
        where: { id: data.deliveryZoneId, branchId, isActive: true },
      });
      if (!zone) return fail("not_found");
      deliveryFee = zone.fee;
    }

    let table: { id: string; status: string } | null = null;
    if (data.type === "dine_in") {
      const found = await db.restaurantTable.findFirst({
        where: { id: data.tableId!, branchId, isActive: true },
        select: { id: true, status: true },
      });
      if (!found) return fail("not_found");
      if (found.status === "cleaning") return fail("table_not_ready");
      table = found;
    }

    if (data.waiterId) {
      const waiter = await db.user.findFirst({ where: { id: data.waiterId, orgId, isActive: true } });
      if (!waiter) return fail("not_found");
    }
    if (data.driverId) {
      const driver = await db.user.findFirst({ where: { id: data.driverId, orgId, isActive: true } });
      if (!driver) return fail("not_found");
    }

    // Customer capture (delivery, or any order with a phone provided)
    let customerId: string | null = null;
    const phone = data.customerPhone?.trim() || null;
    if (phone) {
      const customer = await db.customer.upsert({
        where: { orgId_phone: { orgId, phone } },
        update: { ...(data.customerName?.trim() ? { name: data.customerName.trim() } : {}) },
        create: { orgId, phone, name: data.customerName?.trim() || "Client" },
      });
      customerId = customer.id;
    }

    // --- Totals ---------------------------------------------------------------
    const totals = computeOrderTotals({
      lines: built.map((b) => b.line),
      discount,
      deliveryFee,
      taxMode: settings["tax.mode"],
    });

    // --- Transaction: counter → order → items → table → audit ------------------
    const dateKey = dateKeyFor(org.timezone);
    const prefix = ORDER_NUMBER_PREFIX[data.type as OrderType];

    try {
      const created = await db.$transaction(async (tx) => {
        const counter = await tx.orderCounter.upsert({
          where: { branchId_scope_dateKey: { branchId, scope: "order", dateKey } },
          update: { seq: { increment: 1 } },
          create: { branchId, scope: "order", dateKey, seq: 1 },
        });
        const number = `${prefix}-${counter.seq + 100}`; // start daily numbering at 101

        const now = new Date();
        const order = await tx.order.create({
          data: {
            orgId,
            branchId,
            dateKey,
            seq: counter.seq,
            number,
            type: data.type,
            status: "confirmed",
            confirmedAt: now,
            tableId: table?.id ?? null,
            guestCount: data.type === "dine_in" ? data.guestCount ?? null : null,
            customerId,
            customerNameSnapshot: data.customerName?.trim() || null,
            customerPhoneSnapshot: phone,
            deliveryAddress: data.type === "delivery" ? data.deliveryAddress?.trim() ?? null : null,
            deliveryZoneId: data.type === "delivery" ? data.deliveryZoneId ?? null : null,
            deliveryFee,
            driverId: data.type === "delivery" ? data.driverId ?? null : null,
            waiterId: data.waiterId ?? (data.type === "dine_in" ? auth.user.id : null),
            createdById: auth.user.id,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            discountReason: data.discount?.reason?.trim() || null,
            taxAmount: totals.taxAmount,
            total: totals.total,
            notes: data.notes?.trim() || null,
            idempotencyKey: data.idempotencyKey,
          },
        });

        for (const item of built) {
          const parent = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              variantId: item.variantId,
              nameSnapshot: item.nameSnapshot,
              variantNameSnapshot: item.variantNameSnapshot,
              unitPrice: item.unitPrice,
              qty: item.qty,
              taxRate: item.taxRate,
              notes: item.notes,
              lineSubtotal: lineUnitPrice(item.line) * item.qty,
              lineTotal: lineTotal(item.line),
              modifiers: {
                create: item.modifiers.map((m) => ({
                  modifierId: m.modifierId,
                  nameSnapshot: m.nameSnapshot,
                  priceDelta: m.priceDelta,
                  ingredientId: m.ingredientId,
                  ingredientQty: m.ingredientQty,
                })),
              },
            },
          });
          for (const child of item.children) {
            await tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: child.productId,
                parentItemId: parent.id,
                comboGroupId: child.comboGroupId,
                nameSnapshot: child.nameSnapshot,
                unitPrice: 0,
                qty: child.qty,
                taxRate: 0,
                lineSubtotal: 0,
                lineTotal: 0,
              },
            });
          }
        }

        if (table) {
          await tx.restaurantTable.update({ where: { id: table.id }, data: { status: "occupied" } });
        }

        await writeAudit(
          {
            orgId,
            branchId,
            userId: auth.user.id,
            action: "order.created",
            entity: "order",
            entityId: order.id,
            after: { number, type: data.type, total: totals.total, items: built.length },
          },
          tx
        );

        return order;
      });

      revalidateOps();
      return ok({
        id: created.id,
        number: created.number,
        total: created.total,
        subtotal: created.subtotal,
        discountAmount: created.discountAmount,
        taxAmount: created.taxAmount,
        deliveryFee: created.deliveryFee,
      });
    } catch (e) {
      // Idempotent retry: unique(idempotencyKey) raced — return the winner
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const winner = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
        if (winner) {
          return ok({
            id: winner.id,
            number: winner.number,
            total: winner.total,
            subtotal: winner.subtotal,
            discountAmount: winner.discountAmount,
            taxAmount: winner.taxAmount,
            deliveryFee: winner.deliveryFee,
          });
        }
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, "preparingAt" | "readyAt" | "servedAt" | "completedAt">> = {
  preparing: "preparingAt",
  ready: "readyAt",
  served: "servedAt",
  out_for_delivery: "servedAt",
  completed: "completedAt",
};

export async function updateOrderStatusAction(orderId: string, next: OrderStatus): Promise<ActionResult> {
  try {
    const auth = await assertPermission("orders.update");
    const order = await db.order.findFirst({ where: { id: orderId, orgId: auth.user.orgId } });
    if (!order) return fail("not_found");
    assertBranchAccess(auth, order.branchId);

    if (next === "cancelled") return fail("invalid_input"); // use cancelOrderAction
    if (!canTransition(order.status as OrderStatus, next)) return fail("invalid_transition");
    if (next === "completed" && remainingDue(order.total, order.paidAmount) > 0) {
      return fail("unpaid_balance");
    }

    await db.$transaction(async (tx) => {
      const tsField = STATUS_TIMESTAMP[next];
      await tx.order.update({
        where: { id: order.id },
        data: { status: next, ...(tsField ? { [tsField]: new Date() } : {}), version: { increment: 1 } },
      });
      if (next === "completed" && order.tableId) {
        await releaseTable(tx, order.tableId, order.id);
      }
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: order.branchId,
          userId: auth.user.id,
          action: "order.status_changed",
          entity: "order",
          entityId: order.id,
          before: { status: order.status },
          after: { status: next },
        },
        tx
      );
    });

    revalidateOps();
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function cancelOrderAction(input: CancelOrderInput): Promise<ActionResult> {
  try {
    const auth = await assertPermission("orders.cancel");
    const parsed = cancelOrderSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");

    const order = await db.order.findFirst({ where: { id: parsed.data.orderId, orgId: auth.user.orgId } });
    if (!order) return fail("not_found");
    assertBranchAccess(auth, order.branchId);
    if (!isOpenStatus(order.status as OrderStatus)) return fail("invalid_transition");
    if (order.paidAmount - order.refundedAmount > 0) return fail("refund_first");

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: parsed.data.reason,
          cancelledById: auth.user.id,
          version: { increment: 1 },
        },
      });
      if (order.tableId) await releaseTable(tx, order.tableId, order.id);
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: order.branchId,
          userId: auth.user.id,
          action: "order.cancelled",
          entity: "order",
          entityId: order.id,
          before: { status: order.status, total: order.total },
          after: { reason: parsed.data.reason },
        },
        tx
      );
    });

    revalidateOps();
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

// ---------------------------------------------------------------------------
// Floor operations: move / merge / split / waiter / bill request
// ---------------------------------------------------------------------------

export async function moveOrderToTableAction(orderId: string, tableId: string): Promise<ActionResult> {
  try {
    const auth = await assertPermission("tables.manage");
    const order = await db.order.findFirst({ where: { id: orderId, orgId: auth.user.orgId } });
    if (!order || order.type !== "dine_in") return fail("not_found");
    assertBranchAccess(auth, order.branchId);
    if (!isOpenStatus(order.status as OrderStatus)) return fail("invalid_transition");

    const target = await db.restaurantTable.findFirst({
      where: { id: tableId, branchId: order.branchId, isActive: true },
    });
    if (!target) return fail("not_found");
    if (target.status === "cleaning") return fail("table_not_ready");
    if (target.id === order.tableId) return ok();

    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { tableId: target.id, version: { increment: 1 } } });
      await tx.restaurantTable.update({ where: { id: target.id }, data: { status: "occupied" } });
      if (order.tableId) await releaseTable(tx, order.tableId, order.id);
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: order.branchId,
          userId: auth.user.id,
          action: "order.moved",
          entity: "order",
          entityId: order.id,
          before: { tableId: order.tableId },
          after: { tableId: target.id },
        },
        tx
      );
    });

    revalidateOps();
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function mergeOrdersAction(sourceOrderId: string, targetOrderId: string): Promise<ActionResult> {
  try {
    const auth = await assertPermission("tables.manage");
    if (sourceOrderId === targetOrderId) return fail("invalid_input");

    const [source, target] = await Promise.all([
      db.order.findFirst({ where: { id: sourceOrderId, orgId: auth.user.orgId } }),
      db.order.findFirst({ where: { id: targetOrderId, orgId: auth.user.orgId } }),
    ]);
    if (!source || !target) return fail("not_found");
    assertBranchAccess(auth, source.branchId);
    if (source.branchId !== target.branchId) return fail("invalid_input");
    if (!isOpenStatus(source.status as OrderStatus) || !isOpenStatus(target.status as OrderStatus)) {
      return fail("invalid_transition");
    }
    if (source.paidAmount > 0) return fail("source_paid");

    const settings = await getSettings(auth.user.orgId, source.branchId);

    await db.$transaction(async (tx) => {
      await tx.orderItem.updateMany({ where: { orderId: source.id }, data: { orderId: target.id } });
      await tx.order.update({
        where: { id: source.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: `merged:#${target.number}`,
          cancelledById: auth.user.id,
          subtotal: 0,
          taxAmount: 0,
          discountAmount: 0,
          total: 0,
          version: { increment: 1 },
        },
      });
      await recomputeOrderTotals(tx, target.id, settings["tax.mode"]);
      if (source.tableId && source.tableId !== target.tableId) {
        await releaseTable(tx, source.tableId, source.id);
      }
      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: source.branchId,
          userId: auth.user.id,
          action: "order.merged",
          entity: "order",
          entityId: target.id,
          before: { source: source.number, sourceTotal: source.total },
          after: { target: target.number },
        },
        tx
      );
    });

    revalidateOps();
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function splitOrderAction(orderId: string, itemIds: string[]): Promise<ActionResult<{ newOrderId: string; newNumber: string }>> {
  try {
    const auth = await assertPermission("tables.manage");
    if (itemIds.length === 0) return fail("invalid_input");

    const order = await db.order.findFirst({
      where: { id: orderId, orgId: auth.user.orgId },
      include: { items: true },
    });
    if (!order) return fail("not_found");
    assertBranchAccess(auth, order.branchId);
    if (!isOpenStatus(order.status as OrderStatus)) return fail("invalid_transition");
    if (order.paidAmount > 0) return fail("order_has_payments");
    if (order.discountAmount > 0) return fail("split_discounted");

    const parents = order.items.filter((i) => i.parentItemId === null && i.status !== "cancelled");
    const moving = new Set(itemIds);
    const movingParents = parents.filter((i) => moving.has(i.id));
    if (movingParents.length === 0 || movingParents.length === parents.length) return fail("invalid_input");
    if (itemIds.some((id) => !parents.some((p) => p.id === id))) return fail("invalid_input");

    const [org, settings] = await Promise.all([
      db.organization.findUniqueOrThrow({ where: { id: order.orgId } }),
      getSettings(auth.user.orgId, order.branchId),
    ]);
    const dateKey = dateKeyFor(org.timezone);
    const prefix = ORDER_NUMBER_PREFIX[order.type as OrderType];

    const result = await db.$transaction(async (tx) => {
      const counter = await tx.orderCounter.upsert({
        where: { branchId_scope_dateKey: { branchId: order.branchId, scope: "order", dateKey } },
        update: { seq: { increment: 1 } },
        create: { branchId: order.branchId, scope: "order", dateKey, seq: 1 },
      });
      const number = `${prefix}-${counter.seq + 100}`;

      const newOrder = await tx.order.create({
        data: {
          orgId: order.orgId,
          branchId: order.branchId,
          dateKey,
          seq: counter.seq,
          number,
          type: order.type,
          status: order.status,
          confirmedAt: order.confirmedAt,
          tableId: order.tableId,
          guestCount: order.guestCount,
          customerId: order.customerId,
          customerNameSnapshot: order.customerNameSnapshot,
          customerPhoneSnapshot: order.customerPhoneSnapshot,
          waiterId: order.waiterId,
          createdById: auth.user.id,
          notes: `split:#${order.number}`,
        },
      });

      const movingIds = [...movingParents.map((p) => p.id)];
      // children follow their parents
      await tx.orderItem.updateMany({
        where: { OR: [{ id: { in: movingIds } }, { parentItemId: { in: movingIds } }] },
        data: { orderId: newOrder.id },
      });

      await recomputeOrderTotals(tx, order.id, settings["tax.mode"]);
      await recomputeOrderTotals(tx, newOrder.id, settings["tax.mode"]);

      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: order.branchId,
          userId: auth.user.id,
          action: "order.split",
          entity: "order",
          entityId: order.id,
          after: { newOrder: number, movedItems: movingParents.length },
        },
        tx
      );

      return newOrder;
    });

    revalidateOps();
    return ok({ newOrderId: result.id, newNumber: result.number });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

export async function changeWaiterAction(orderId: string, waiterId: string): Promise<ActionResult> {
  try {
    const auth = await assertPermission("tables.manage");
    const order = await db.order.findFirst({ where: { id: orderId, orgId: auth.user.orgId } });
    if (!order) return fail("not_found");
    assertBranchAccess(auth, order.branchId);
    if (!isOpenStatus(order.status as OrderStatus)) return fail("invalid_transition");

    const waiter = await db.user.findFirst({ where: { id: waiterId, orgId: auth.user.orgId, isActive: true } });
    if (!waiter) return fail("not_found");

    await db.order.update({ where: { id: order.id }, data: { waiterId: waiter.id, version: { increment: 1 } } });
    await writeAudit({
      orgId: auth.user.orgId,
      branchId: order.branchId,
      userId: auth.user.id,
      action: "order.waiter_changed",
      entity: "order",
      entityId: order.id,
      before: { waiterId: order.waiterId },
      after: { waiterId: waiter.id },
    });

    revalidateOps();
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

/** Waiter asks for the bill: table shows "awaiting payment" on the floor. */
export async function requestBillAction(orderId: string): Promise<ActionResult> {
  try {
    const auth = await assertPermission("tables.manage");
    const order = await db.order.findFirst({ where: { id: orderId, orgId: auth.user.orgId } });
    if (!order || order.type !== "dine_in" || !order.tableId) return fail("not_found");
    assertBranchAccess(auth, order.branchId);
    if (!isOpenStatus(order.status as OrderStatus)) return fail("invalid_transition");

    await db.restaurantTable.update({ where: { id: order.tableId }, data: { status: "awaiting_payment" } });
    revalidateOps();
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}
