import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getAccessibleBranches, getActiveBranch } from "@/lib/branch";
import { getInventoryRows } from "@/lib/inventory-queries";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { InventoryView } from "@/components/inventory/inventory-view";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const auth = await requirePermissionPage("inventory.view");
  const t = await getTranslations("inventory");
  const locale = (await getLocale()) as Locale;
  const branch = await getActiveBranch(auth);
  const [rows, branches] = await Promise.all([
    getInventoryRows(auth.user.orgId, branch.id),
    getAccessibleBranches(auth),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} description={t("subtitle", { branch: branch.name })} />
      <InventoryView
        rows={rows}
        branchId={branch.id}
        branches={branches}
        locale={locale}
        permissions={{
          adjust: auth.permissions.has("inventory.adjust"),
          transfer: auth.permissions.has("inventory.transfer"),
        }}
      />
    </div>
  );
}
