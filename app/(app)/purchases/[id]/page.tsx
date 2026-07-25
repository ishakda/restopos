import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getPurchaseOrderDetail } from "@/lib/inventory-queries";
import type { Locale } from "@/lib/locale";

import { PoDetailView } from "@/components/purchases/po-detail-view";

export const metadata = { title: "Purchase order" };

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionPage("purchases.view");
  const { id } = await params;
  const po = await getPurchaseOrderDetail(auth.user.orgId, id);
  if (!po) notFound();

  await getTranslations("purchases"); // warm namespace
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-4xl">
      <PoDetailView
        locale={locale}
        permissions={{
          manage: auth.permissions.has("purchases.manage"),
          receive: auth.permissions.has("purchases.receive"),
          pay: auth.permissions.has("suppliers.pay"),
        }}
        po={{
          id: po.id,
          number: po.number,
          status: po.status,
          paymentStatus: po.paymentStatus,
          amountPaid: po.amountPaid,
          subtotal: po.subtotal,
          taxAmount: po.taxAmount,
          total: po.total,
          notes: po.notes,
          createdAt: po.createdAt.toISOString(),
          orderedAt: po.orderedAt?.toISOString() ?? null,
          receivedAt: po.receivedAt?.toISOString() ?? null,
          createdByName: po.createdBy.name,
          supplier: { id: po.supplier.id, name: po.supplier.name, phone: po.supplier.phone },
          items: po.items.map((item) => ({
            id: item.id,
            ingredientName: item.ingredient.name,
            baseUnit: item.ingredient.baseUnit,
            displayUnit: item.displayUnit,
            qtyOrdered: item.qtyOrdered,
            qtyReceived: item.qtyReceived,
            unitCostMilli: item.unitCostMilli,
            lineTotal: item.lineTotal,
          })),
          payments: po.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            userName: p.user.name,
            paidAt: p.paidAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
