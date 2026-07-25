import { notFound } from "next/navigation";

import { requirePermissionPage } from "@/lib/auth/session";
import { getProductEditorData } from "@/lib/menu-queries";
import type { DisplayUnit } from "@/lib/constants";
import { fromBaseUnits } from "@/lib/units";

import {
  ProductEditor,
  type ProductEditorInitial,
  type VariantDraft,
} from "@/components/menu/product-editor";
import type { RecipeItemDraft } from "@/components/menu/recipe-editor";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionPage("menu.manage");
  const { id } = await params;
  const { categories, modifierGroups, ingredients, simpleProducts, product } = await getProductEditorData(
    auth.user.orgId,
    id
  );
  if (!product) notFound();

  const recipeToDrafts = (variantId: string | null): RecipeItemDraft[] => {
    const recipe = product.recipes.find((r) => r.variantId === variantId);
    if (!recipe) return [];
    return recipe.items.map((item) => ({
      ingredientId: item.ingredientId,
      qty: String(fromBaseUnits(item.qty, item.displayUnit as DisplayUnit)),
      displayUnit: item.displayUnit as DisplayUnit,
    }));
  };

  const variants: VariantDraft[] = product.variants.map((v) => ({
    id: v.id,
    name: v.name,
    priceDelta: String(v.priceDelta / 100),
    isDefault: v.isDefault,
    isActive: v.isActive,
    recipeItems: recipeToDrafts(v.id),
  }));

  const initial: ProductEditorInitial = {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    type: product.type as "simple" | "combo",
    sellPrice: String(product.sellPrice / 100),
    taxRatePct: String(product.taxRate / 100),
    manualCost: product.costPrice ? String(product.costPrice / 100) : "",
    isActive: product.isActive,
    isAvailable: product.isAvailable,
    prepTimeMinutes: product.prepTimeMinutes != null ? String(product.prepTimeMinutes) : "",
    variants,
    modifierGroupIds: product.modifierGroups.map((g) => g.groupId),
    comboGroups: product.comboGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: String(g.minSelect),
      maxSelect: String(g.maxSelect),
      items: g.items.map((item) => ({
        productId: item.productId,
        priceDelta: String(item.priceDelta / 100),
        isDefault: item.isDefault,
      })),
    })),
    baseRecipeItems: recipeToDrafts(null),
  };

  return (
    <ProductEditor
      initial={initial}
      categories={categories}
      modifierGroups={modifierGroups}
      ingredients={ingredients}
      simpleProducts={simpleProducts}
    />
  );
}
