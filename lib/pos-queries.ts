import "server-only";

import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isOpenStatus } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/constants";

const OPEN_STATUSES = ["new", "confirmed", "preparing", "ready", "served", "out_for_delivery"];

/** Everything the POS screen needs, in one serializable payload. */
export async function getPosData(orgId: string, branchId: string) {
  const [categories, products, tables, zones, methods, staff, settings] = await Promise.all([
    db.category.findMany({
      where: { orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, imageUrl: true },
    }),
    db.product.findMany({
      where: { orgId, isActive: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      include: {
        variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        modifierGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            group: {
              include: { modifiers: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
            },
          },
        },
        comboGroups: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" }, include: { product: { select: { name: true, isActive: true, isAvailable: true } } } } },
        },
        branches: { where: { branchId } },
      },
    }),
    db.restaurantTable.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ zone: "asc" }, { name: "asc" }],
      select: { id: true, name: true, seats: true, zone: true, status: true },
    }),
    db.deliveryZone.findMany({
      where: { branchId, isActive: true },
      select: { id: true, name: true, fee: true },
    }),
    db.paymentMethod.findMany({
      where: { orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    db.user.findMany({
      where: {
        orgId,
        isActive: true,
        OR: [{ branchId }, { branchId: null }],
        role: { systemKey: { in: ["waiter", "cashier", "manager", "delivery", "owner", "administrator"] } },
      },
      select: { id: true, name: true, role: { select: { systemKey: true } } },
    }),
    getSettings(orgId, branchId),
  ]);

  return {
    categories,
    products: products.map((p) => {
      const override = p.branches[0];
      return {
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId,
        type: p.type as "simple" | "combo",
        sellPrice: override?.priceOverride ?? p.sellPrice,
        taxRate: p.taxRate,
        isAvailable: p.isAvailable && override?.isAvailable !== false,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          priceDelta: v.priceDelta,
          isDefault: v.isDefault,
        })),
        modifierGroups: p.modifierGroups
          .filter((pg) => pg.group.isActive)
          .map((pg) => ({
            id: pg.group.id,
            name: pg.group.name,
            minSelect: pg.group.minSelect,
            maxSelect: pg.group.maxSelect,
            modifiers: pg.group.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })),
          })),
        comboGroups: p.comboGroups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          items: g.items
            .filter((ci) => ci.product.isActive)
            .map((ci) => ({
              productId: ci.productId,
              name: ci.product.name,
              priceDelta: ci.priceDelta,
              isDefault: ci.isDefault,
              isAvailable: ci.product.isAvailable,
            })),
        })),
      };
    }),
    tables,
    zones,
    methods,
    staff: staff.map((s) => ({ id: s.id, name: s.name, roleKey: s.role.systemKey })),
    settings: {
      defaultOrderType: settings["pos.defaultOrderType"],
      taxMode: settings["tax.mode"],
    },
  };
}

export type PosData = Awaited<ReturnType<typeof getPosData>>;
export type PosProduct = PosData["products"][number];

/** Orders list with filters. */
export async function getOrdersList(
  orgId: string,
  branchId: string,
  filters: { status?: string; type?: string; q?: string; openOnly?: boolean }
) {
  const orders = await db.order.findMany({
    where: {
      orgId,
      branchId,
      ...(filters.openOnly ? { status: { in: OPEN_STATUSES } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.q ? { number: { contains: filters.q } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      table: { select: { name: true } },
      waiter: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: { where: { parentItemId: null } } } },
    },
  });
  return orders;
}

/** Full order detail for the shared order sheet. */
export async function getOrderDetail(orgId: string, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, orgId },
    include: {
      table: { select: { id: true, name: true } },
      waiter: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      deliveryZone: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { modifiers: true },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { method: { select: { name: true, code: true, type: true } }, takenBy: { select: { name: true } } },
      },
      refunds: { orderBy: { createdAt: "asc" }, include: { processedBy: { select: { name: true } } } },
    },
  });
  return order;
}

/** Floor view: tables with their open orders. */
export async function getTablesData(branchId: string) {
  const [tables, openOrders] = await Promise.all([
    db.restaurantTable.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ zone: "asc" }, { name: "asc" }],
    }),
    db.order.findMany({
      where: { branchId, type: "dine_in", status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: "asc" },
      include: { waiter: { select: { name: true } }, _count: { select: { items: { where: { parentItemId: null } } } } },
    }),
  ]);

  const ordersByTable = new Map<string, typeof openOrders>();
  for (const order of openOrders) {
    if (!order.tableId) continue;
    const list = ordersByTable.get(order.tableId) ?? [];
    list.push(order);
    ordersByTable.set(order.tableId, list);
  }

  return { tables, ordersByTable, openOrders };
}

export function orderIsOpen(status: string): boolean {
  return isOpenStatus(status as OrderStatus);
}
