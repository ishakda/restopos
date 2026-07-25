import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { db } from "@/lib/db";
import { getOrderDetail, getOrdersList } from "@/lib/pos-queries";
import { serializeOrderDetail, type OrderDetailData } from "@/lib/order-detail";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { OrdersView, type OrderListRow } from "@/components/orders/orders-view";

export const metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string; order?: string }>;
}) {
  const auth = await requirePermissionPage("orders.view");
  const t = await getTranslations("orders");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);
  const { status, type, q, order: selectedOrderId } = await searchParams;

  const [orders, methods, detailRaw] = await Promise.all([
    getOrdersList(auth.user.orgId, branch.id, { status, type, q }),
    db.paymentMethod.findMany({
      where: { orgId: auth.user.orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    selectedOrderId ? getOrderDetail(auth.user.orgId, selectedOrderId) : Promise.resolve(null),
  ]);

  const rows: OrderListRow[] = orders.map((o) => ({
    id: o.id,
    number: o.number,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
    itemCount: o._count.items,
    tableName: o.table?.name ?? null,
    customerName: o.customerNameSnapshot,
    staffName: o.waiter?.name ?? o.createdBy.name,
    createdAt: o.createdAt.toISOString(),
  }));

  const detail: OrderDetailData | null = detailRaw ? serializeOrderDetail(detailRaw) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} description={t("subtitle", { branch: branch.name })} />
      <OrdersView
        rows={rows}
        detail={detail}
        methods={methods}
        locale={locale}
        filters={{ status: status ?? null, type: type ?? null, q: q ?? "" }}
        permissions={{
          update: auth.permissions.has("orders.update"),
          cancel: auth.permissions.has("orders.cancel"),
          refund: auth.permissions.has("orders.refund"),
          pay: auth.permissions.has("payments.take"),
          tables: auth.permissions.has("tables.manage"),
        }}
      />
    </div>
  );
}
