import { getLocale, getTranslations } from "next-intl/server";

import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/auth/session";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { ModifiersView } from "@/components/menu/modifiers-view";

export const metadata = { title: "Modifiers" };

export default async function ModifiersPage() {
  const auth = await requirePermissionPage("menu.view");
  const t = await getTranslations("menu");
  const locale = (await getLocale()) as Locale;
  const canManage = auth.permissions.has("menu.manage");

  const [groups, ingredients] = await Promise.all([
    db.modifierGroup.findMany({
      where: { orgId: auth.user.orgId },
      orderBy: { sortOrder: "asc" },
      include: {
        modifiers: { orderBy: { sortOrder: "asc" }, include: { ingredient: { select: { name: true, baseUnit: true } } } },
        _count: { select: { products: true } },
      },
    }),
    db.ingredient.findMany({
      where: { orgId: auth.user.orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, displayUnit: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title={t("modifiersTitle")} description={t("modifiersSubtitle")} className="mb-4" />
      <ModifiersView
        locale={locale}
        canManage={canManage}
        ingredients={ingredients}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          isActive: g.isActive,
          productCount: g._count.products,
          modifiers: g.modifiers.map((m) => ({
            id: m.id,
            name: m.name,
            priceDelta: m.priceDelta,
            isActive: m.isActive,
            ingredientId: m.ingredientId,
            ingredientQty: m.ingredientQty,
            ingredientName: m.ingredient?.name ?? null,
            ingredientBaseUnit: m.ingredient?.baseUnit ?? null,
          })),
        }))}
      />
    </div>
  );
}
