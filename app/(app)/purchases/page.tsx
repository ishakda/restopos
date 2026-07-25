import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PackagePlus, Plus } from "lucide-react";

import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { getPurchaseOrders } from "@/lib/inventory-queries";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";

import { PO_STATUS_BADGE } from "@/components/purchases/po-status";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const auth = await requirePermissionPage("purchases.view");
  const t = await getTranslations("purchases");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);
  const orders = await getPurchaseOrders(auth.user.orgId, branch.id);
  const canManage = auth.permissions.has("purchases.manage");

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle", { branch: branch.name })}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/purchases/new">
                <Plus />
                {t("newPo")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.number")}</TableHead>
              <TableHead>{t("table.supplier")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.date")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.payment")}</TableHead>
              <TableHead className="text-end">{t("table.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <PackagePlus className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
            {orders.map((po) => (
              <TableRow key={po.id}>
                <TableCell>
                  <Link href={`/purchases/${po.id}`} className="font-semibold hover:underline tabular">
                    {po.number}
                  </Link>
                </TableCell>
                <TableCell>{po.supplier.name}</TableCell>
                <TableCell className="hidden text-muted-foreground tabular sm:table-cell">
                  {dateFmt.format(po.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={PO_STATUS_BADGE[po.status] ?? "secondary"}>{t(`status.${po.status}`)}</Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={po.paymentStatus === "paid" ? "success" : po.paymentStatus === "partial" ? "warning" : "destructive"}>
                    {t(`payment.${po.paymentStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-end font-medium tabular">{formatMoney(po.total, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
