import { requirePermissionPage } from "@/lib/auth/session";
import { getProductEditorData } from "@/lib/menu-queries";

import { ProductEditor, emptyProductInitial } from "@/components/menu/product-editor";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const auth = await requirePermissionPage("menu.manage");
  const { categories, modifierGroups, ingredients, simpleProducts } = await getProductEditorData(
    auth.user.orgId,
    null
  );

  return (
    <ProductEditor
      initial={emptyProductInitial(categories.find((c) => c.isActive)?.id ?? null)}
      categories={categories}
      modifierGroups={modifierGroups}
      ingredients={ingredients}
      simpleProducts={simpleProducts}
    />
  );
}
