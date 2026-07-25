import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { db } from "@/lib/db";
import { getMovements } from "@/lib/inventory-queries";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/units";
import { STOCK_MOVEMENT_TYPES, type BaseUnit } from "@/lib/constants";
import type { Locale } from "@/lib/locale";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { MovementFilters } from "@/components/inventory/movement-filters";

export const metadata = { title: "Stock movements" };

const TYPE_BADGE: Record<string, "success" | "destructive" | "warning" | "info" | "secondary"> = {
  purchase: "success",
  sale: "info",
  adjustment: "warning",
  waste: "destructive",
  damage: "destructive",
  transfer_in: "success",
  transfer_out: "warning",
  return: "secondary",
  reversal: "secondary",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ ingredient?: string; type?: string }>;
}) {
  const auth = await requirePermissionPage("inventory.view");
  const t = await getTranslations("inventory");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);
  const { ingredient, type } = await searchParams;

  const [movements, ingredients] = await Promise.all([
    getMovements(auth.user.orgId, branch.id, { ingredientId: ingredient, type }),
    db.ingredient.findMany({
      where: { orgId: auth.user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("movementsTitle")} description={t("movementsSubtitle", { branch: branch.name })} />

      <MovementFilters
        ingredients={ingredients}
        types={[...STOCK_MOVEMENT_TYPES]}
        active={{ ingredient: ingredient ?? null, type: type ?? null }}
      />

      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mv.date")}</TableHead>
              <TableHead>{t("table.ingredient")}</TableHead>
              <TableHead>{t("mv.type")}</TableHead>
              <TableHead className="text-end">{t("mv.change")}</TableHead>
              <TableHead className="hidden text-end md:table-cell">{t("mv.after")}</TableHead>
              <TableHead className="hidden text-end lg:table-cell">{t("mv.value")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("mv.user")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("mv.reference")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {t("noMovements")}
                </TableCell>
              </TableRow>
            )}
            {movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                  {dateFmt.format(m.createdAt)}
                </TableCell>
                <TableCell className="font-medium">{m.ingredient.name}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_BADGE[m.type] ?? "secondary"}>{t(`mvType.${m.type}`)}</Badge>
                </TableCell>
                <TableCell className={`text-end font-semibold tabular ${m.qtyChange < 0 ? "text-destructive" : "text-success"}`}>
                  {m.qtyChange > 0 ? "+" : ""}
                  {formatQty(m.qtyChange, m.ingredient.baseUnit as BaseUnit)}
                </TableCell>
                <TableCell className="hidden text-end text-muted-foreground tabular md:table-cell">
                  {formatQty(m.qtyAfter, m.ingredient.baseUnit as BaseUnit)}
                </TableCell>
                <TableCell className="hidden text-end text-muted-foreground tabular lg:table-cell">
                  {m.totalCostCentimes != null ? formatMoney(m.totalCostCentimes, locale) : "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{m.user.name}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {m.order?.number ? `#${m.order.number}` : m.purchaseOrder?.number ?? m.reference ?? m.reason ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
