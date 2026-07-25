import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { db } from "@/lib/db";
import { getOrderDetail, getTablesData } from "@/lib/pos-queries";
import { serializeOrderDetail, type OrderDetailData } from "@/lib/order-detail";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { TablesView, type FloorOrder, type FloorTable } from "@/components/tables/tables-view";

export const metadata = { title: "Tables" };

export default async function TablesPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const auth = await requirePermissionPage("tables.view");
  const t = await getTranslations("tables");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);
  const { order: selectedOrderId } = await searchParams;

  const [{ tables, ordersByTable }, methods, detailRaw] = await Promise.all([
    getTablesData(branch.id),
    db.paymentMethod.findMany({
      where: { orgId: auth.user.orgId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    selectedOrderId ? getOrderDetail(auth.user.orgId, selectedOrderId) : Promise.resolve(null),
  ]);

  const floorTables: FloorTable[] = tables.map((table) => {
    const orders = ordersByTable.get(table.id) ?? [];
    return {
      id: table.id,
      name: table.name,
      seats: table.seats,
      zone: table.zone,
      status: table.status,
      orders: orders.map(
        (o): FloorOrder => ({
          id: o.id,
          number: o.number,
          total: o.total,
          paidAmount: o.paidAmount,
          guestCount: o.guestCount,
          waiterName: o.waiter?.name ?? null,
          itemCount: o._count.items,
          createdAt: o.createdAt.toISOString(),
        })
      ),
    };
  });

  const detail: OrderDetailData | null = detailRaw ? serializeOrderDetail(detailRaw) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} description={t("subtitle", { branch: branch.name })} />
      <TablesView
        tables={floorTables}
        branchId={branch.id}
        detail={detail}
        methods={methods}
        locale={locale}
        permissions={{
          manage: auth.permissions.has("tables.manage"),
          editFloor: auth.permissions.has("tables.edit_floor"),
          pos: auth.permissions.has("pos.use"),
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
