import { getTranslations } from "next-intl/server";

import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/auth/session";

import { PageHeader } from "@/components/layout/page-header";
import { CategoriesView } from "@/components/menu/categories-view";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const auth = await requirePermissionPage("menu.view");
  const t = await getTranslations("menu");
  const canManage = auth.permissions.has("menu.manage");

  const categories = await db.category.findMany({
    where: { orgId: auth.user.orgId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div>
      <PageHeader title={t("categoriesTitle")} description={t("categoriesSubtitle")} className="mb-4" />
      <CategoriesView
        canManage={canManage}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          imageUrl: c.imageUrl,
          isActive: c.isActive,
          productCount: c._count.products,
        }))}
      />
    </div>
  );
}
