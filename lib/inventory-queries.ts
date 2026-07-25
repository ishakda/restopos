import "server-only";

import { db } from "@/lib/db";
import { stockLevel, stockValueCentimes, type StockLevel } from "@/lib/stock";

export interface InventoryRow {
  ingredientId: string;
  name: string;
  category: string | null;
  baseUnit: string;
  displayUnit: string;
  avgCostMilli: number;
  qtyOnHand: number;
  minQty: number;
  storageLocation: string | null;
  level: StockLevel;
  valueCentimes: number;
  isActive: boolean;
}

export async function getInventoryRows(orgId: string, branchId: string): Promise<InventoryRow[]> {
  const ingredients = await db.ingredient.findMany({
    where: { orgId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { inventory: { where: { branchId } } },
  });

  return ingredients
    .filter((i) => i.isActive || (i.inventory[0]?.qtyOnHand ?? 0) !== 0)
    .map((ingredient) => {
      const row = ingredient.inventory[0];
      const qty = row?.qtyOnHand ?? 0;
      const minQty = row?.minQty ?? 0;
      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        category: ingredient.category,
        baseUnit: ingredient.baseUnit,
        displayUnit: ingredient.displayUnit,
        avgCostMilli: ingredient.avgCostMilli,
        qtyOnHand: qty,
        minQty,
        storageLocation: row?.storageLocation ?? null,
        level: stockLevel(qty, minQty),
        valueCentimes: stockValueCentimes(Math.max(0, qty), ingredient.avgCostMilli),
        isActive: ingredient.isActive,
      };
    });
}

export async function getStockAlerts(orgId: string, branchId: string) {
  const rows = await getInventoryRows(orgId, branchId);
  return {
    low: rows.filter((r) => r.level === "low"),
    out: rows.filter((r) => r.level === "out"),
  };
}

export async function getMovements(
  orgId: string,
  branchId: string,
  filters: { ingredientId?: string; type?: string },
  take = 150
) {
  return db.stockMovement.findMany({
    where: {
      orgId,
      branchId,
      ...(filters.ingredientId ? { ingredientId: filters.ingredientId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      ingredient: { select: { name: true, baseUnit: true } },
      user: { select: { name: true } },
      order: { select: { number: true } },
      purchaseOrder: { select: { number: true } },
    },
  });
}

export async function getWasteRecords(orgId: string, branchId: string, take = 100) {
  const [records, monthAgg] = await Promise.all([
    db.wasteRecord.findMany({
      where: { orgId, branchId },
      orderBy: { createdAt: "desc" },
      take,
      include: { ingredient: { select: { name: true, baseUnit: true } }, user: { select: { name: true } } },
    }),
    db.wasteRecord.aggregate({
      where: {
        orgId,
        branchId,
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { costCentimes: true },
      _count: true,
    }),
  ]);
  return { records, monthLossCentimes: monthAgg._sum.costCentimes ?? 0, monthCount: monthAgg._count };
}

export async function getSuppliersWithBalance(orgId: string) {
  const suppliers = await db.supplier.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: {
      purchaseOrders: {
        where: { status: { in: ["ordered", "partially_received", "received"] } },
        select: { total: true },
      },
      payments: { select: { amount: true } },
      _count: { select: { purchaseOrders: true, ingredients: true } },
    },
  });

  return suppliers.map((s) => {
    const purchased = s.purchaseOrders.reduce((sum, po) => sum + po.total, 0);
    const paid = s.payments.reduce((sum, p) => sum + p.amount, 0);
    return {
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes,
      isActive: s.isActive,
      poCount: s._count.purchaseOrders,
      purchasedCentimes: purchased,
      paidCentimes: paid,
      balanceCentimes: purchased - paid,
    };
  });
}

export async function getPurchaseOrders(orgId: string, branchId: string, status?: string) {
  return db.purchaseOrder.findMany({
    where: { orgId, branchId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getPurchaseOrderDetail(orgId: string, poId: string) {
  return db.purchaseOrder.findFirst({
    where: { id: poId, orgId },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      createdBy: { select: { name: true } },
      items: {
        include: { ingredient: { select: { name: true, baseUnit: true, displayUnit: true } } },
      },
      payments: { orderBy: { paidAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
}
