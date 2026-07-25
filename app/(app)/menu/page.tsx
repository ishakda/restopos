import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";

import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/auth/session";
import { productCostsMilli } from "@/lib/menu-queries";
import { analyzeFoodCost } from "@/lib/food-cost";
import type { Locale } from "@/lib/locale";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ProductsTable, type ProductRow } from "@/components/menu/products-table";

export const metadata = { title: "Menu" };

export default async function MenuProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const auth = await requirePermissionPage("menu.view");
  const t = await getTranslations("menu");
  const locale = (await getLocale()) as Locale;
  const { q, category } = await searchParams;
  const canManage = auth.permissions.has("menu.manage");

  const [categories, products, costs] = await Promise.all([
    db.category.findMany({
      where: { orgId: auth.user.orgId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: {
        orgId: auth.user.orgId,
        ...(category ? { categoryId: category } : {}),
        ...(q ? { name: { contains: q } } : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      include: {
        category: { select: { name: true } },
        variants: { where: { isActive: true }, select: { id: true } },
        recipes: { where: { variantId: null }, select: { id: true } },
      },
    }),
    productCostsMilli(auth.user.orgId),
  ]);

  const rows: ProductRow[] = products.map((p) => {
    const costMilli = costs.get(p.id) ?? 0;
    const analysis = analyzeFoodCost({ sellPrice: p.sellPrice, taxRateBp: p.taxRate, costMilli });
    return {
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      categoryName: p.category.name,
      type: p.type,
      sellPrice: p.sellPrice,
      taxRate: p.taxRate,
      isActive: p.isActive,
      isAvailable: p.isAvailable,
      variantCount: p.variants.length,
      hasRecipe: p.recipes.length > 0 || p.type === "combo",
      costCentimes: analysis.costCentimes,
      foodCostBp: analysis.foodCostBp,
      marginCentimes: analysis.grossMarginCentimes,
    };
  });

  return (
    <div>
      <PageHeader
        title={t("productsTitle")}
        description={t("productsSubtitle", { count: rows.length })}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/menu/products/new">
                <Plus />
                {t("newProduct")}
              </Link>
            </Button>
          ) : undefined
        }
        className="mb-4"
      />
      <ProductsTable
        rows={rows}
        categories={categories}
        activeCategory={category ?? null}
        query={q ?? ""}
        canManage={canManage}
        locale={locale}
      />
    </div>
  );
}
