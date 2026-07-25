import { getLocale, getTranslations } from "next-intl/server";

import { db } from "@/lib/db";
import { requireAnyPermissionPage } from "@/lib/auth/session";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { IngredientsView } from "@/components/ingredients/ingredients-view";

export const metadata = { title: "Ingredients" };

export default async function IngredientsPage() {
  const auth = await requireAnyPermissionPage(["inventory.view", "menu.manage"]);
  const t = await getTranslations("ingredients");
  const locale = (await getLocale()) as Locale;
  const canManage =
    auth.permissions.has("inventory.adjust") || auth.permissions.has("menu.manage");

  const ingredients = await db.ingredient.findMany({
    where: { orgId: auth.user.orgId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { recipeItems: true, modifiers: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} description={t("subtitle", { count: ingredients.length })} />
      <IngredientsView
        locale={locale}
        canManage={canManage}
        ingredients={ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          sku: i.sku,
          barcode: i.barcode,
          baseUnit: i.baseUnit,
          displayUnit: i.displayUnit,
          avgCostMilli: i.avgCostMilli,
          isActive: i.isActive,
          usageCount: i._count.recipeItems + i._count.modifiers,
        }))}
      />
    </div>
  );
}
