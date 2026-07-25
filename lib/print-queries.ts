import "server-only";

import { db } from "@/lib/db";
import { getOrderDetail } from "@/lib/pos-queries";
import { serializeOrderDetail, type OrderDetailData } from "@/lib/order-detail";
import { getSettings } from "@/lib/settings";

export interface ReceiptData {
  order: OrderDetailData;
  org: { name: string; logoUrl: string | null; taxId: string | null };
  branch: { name: string; address: string | null; phone: string | null };
  footer: string;
  showLogo: boolean;
}

export async function getReceiptData(orgId: string, orderId: string): Promise<ReceiptData | null> {
  const raw = await getOrderDetail(orgId, orderId);
  if (!raw) return null;

  const [org, branch, settings] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, logoUrl: true, taxId: true },
    }),
    db.branch.findUniqueOrThrow({
      where: { id: raw.branchId },
      select: { name: true, address: true, phone: true },
    }),
    getSettings(orgId, raw.branchId),
  ]);

  return {
    order: serializeOrderDetail(raw),
    org,
    branch,
    footer: settings["receipt.footer"],
    showLogo: settings["receipt.showLogo"],
  };
}

export interface KitchenTicketData {
  number: string;
  type: string;
  tableName: string | null;
  customerName: string | null;
  notes: string | null;
  confirmedAt: string;
  printerName: string | null;
  items: {
    id: string;
    qty: number;
    name: string;
    variantName: string | null;
    modifiers: string[];
    notes: string | null;
    children: string[];
  }[];
}

/**
 * Kitchen ticket — optionally routed to a printer: when the printer has
 * category links, only items of those categories are included (spec §24:
 * "Pizza → Kitchen printer, Drinks → Bar printer"). A printer with no links
 * receives everything.
 */
export async function getKitchenTicketData(
  orgId: string,
  orderId: string,
  printerId?: string | null
): Promise<KitchenTicketData | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, orgId },
    include: {
      table: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          modifiers: { select: { nameSnapshot: true } },
          product: { select: { categoryId: true } },
        },
      },
    },
  });
  if (!order) return null;

  let allowedCategories: Set<string> | null = null;
  let printerName: string | null = null;
  if (printerId) {
    const printer = await db.printer.findFirst({
      where: { id: printerId, branchId: order.branchId },
      include: { categories: { select: { categoryId: true } } },
    });
    if (printer) {
      printerName = printer.name;
      if (printer.categories.length > 0) {
        allowedCategories = new Set(printer.categories.map((c) => c.categoryId));
      }
    }
  }

  const parents = order.items.filter(
    (item) =>
      item.parentItemId === null &&
      item.status !== "cancelled" &&
      (!allowedCategories || allowedCategories.has(item.product.categoryId))
  );
  const childrenByParent = new Map<string, string[]>();
  for (const item of order.items) {
    if (!item.parentItemId) continue;
    const list = childrenByParent.get(item.parentItemId) ?? [];
    list.push(item.nameSnapshot);
    childrenByParent.set(item.parentItemId, list);
  }

  return {
    number: order.number,
    type: order.type,
    tableName: order.table?.name ?? null,
    customerName: order.customerNameSnapshot,
    notes: order.notes,
    confirmedAt: (order.confirmedAt ?? order.createdAt).toISOString(),
    printerName,
    items: parents.map((item) => ({
      id: item.id,
      qty: item.qty,
      name: item.nameSnapshot,
      variantName: item.variantNameSnapshot,
      modifiers: item.modifiers.map((m) => m.nameSnapshot),
      notes: item.notes,
      children: childrenByParent.get(item.id) ?? [],
    })),
  };
}
