import { getLocale, getTranslations } from "next-intl/server";

import { requireAnyPermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { db } from "@/lib/db";
import { getWasteRecords } from "@/lib/inventory-queries";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { WasteView } from "@/components/inventory/waste-view";

export const metadata = { title: "Waste" };

export default async function WastePage() {
  const auth = await requireAnyPermissionPage(["waste.view", "waste.create"]);
  const t = await getTranslations("waste");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);

  const [{ records, monthLossCentimes, monthCount }, ingredients] = await Promise.all([
    getWasteRecords(auth.user.orgId, branch.id),
    db.ingredient.findMany({
      where: { orgId: auth.user.orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, displayUnit: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("title")} description={t("subtitle", { branch: branch.name })} />
      <WasteView
        branchId={branch.id}
        locale={locale}
        canCreate={auth.permissions.has("waste.create")}
        monthLossCentimes={monthLossCentimes}
        monthCount={monthCount}
        ingredients={ingredients}
        records={records.map((r) => ({
          id: r.id,
          ingredientName: r.ingredient.name,
          baseUnit: r.ingredient.baseUnit,
          qty: r.qty,
          reason: r.reason,
          costCentimes: r.costCentimes,
          userName: r.user.name,
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
