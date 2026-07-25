import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { db } from "@/lib/db";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { PoEditor } from "@/components/purchases/po-editor";

export const metadata = { title: "New purchase order" };

export default async function NewPurchasePage() {
  const auth = await requirePermissionPage("purchases.manage");
  const t = await getTranslations("purchases");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);

  const [suppliers, ingredients] = await Promise.all([
    db.supplier.findMany({
      where: { orgId: auth.user.orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.ingredient.findMany({
      where: { orgId: auth.user.orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, displayUnit: true, lastCostMilli: true, category: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("newPo")} description={t("newPoSubtitle", { branch: branch.name })} />
      <PoEditor branchId={branch.id} suppliers={suppliers} ingredients={ingredients} locale={locale} />
    </div>
  );
}
