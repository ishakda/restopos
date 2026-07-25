import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

import { KdsScreen, type KdsOrder } from "@/components/kitchen/kds-screen";

export const metadata = { title: "Kitchen" };

/**
 * Kitchen Display System — deliberately NO financial data anywhere on this
 * screen (spec §7): no prices, no totals, no payment info.
 */
export default async function KitchenPage() {
  const auth = await requirePermissionPage("kitchen.view");
  const branch = await getActiveBranch(auth);
  const settings = await getSettings(auth.user.orgId, branch.id);

  const orders = await db.order.findMany({
    where: { branchId: branch.id, status: { in: ["confirmed", "preparing", "ready"] } },
    orderBy: { confirmedAt: "asc" },
    include: {
      table: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { modifiers: { select: { id: true, nameSnapshot: true } } },
      },
    },
  });

  const kdsOrders: KdsOrder[] = orders.map((order) => {
    const parents = order.items.filter((i) => i.parentItemId === null && i.status !== "cancelled");
    const childrenByParent = new Map<string, string[]>();
    for (const item of order.items) {
      if (!item.parentItemId) continue;
      const list = childrenByParent.get(item.parentItemId) ?? [];
      list.push(item.nameSnapshot);
      childrenByParent.set(item.parentItemId, list);
    }
    return {
      id: order.id,
      number: order.number,
      type: order.type,
      status: order.status as "confirmed" | "preparing" | "ready",
      tableName: order.table?.name ?? null,
      customerName: order.customerNameSnapshot,
      notes: order.notes,
      since: (order.confirmedAt ?? order.createdAt).toISOString(),
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
  });

  return (
    <KdsScreen
      orders={kdsOrders}
      branchId={branch.id}
      branchName={branch.name}
      warnAfterMinutes={settings["kitchen.warnAfterMinutes"]}
      canUpdate={auth.permissions.has("kitchen.update") || auth.permissions.has("orders.update")}
    />
  );
}
