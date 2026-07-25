import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getSuppliersWithBalance } from "@/lib/inventory-queries";
import type { Locale } from "@/lib/locale";

import { PageHeader } from "@/components/layout/page-header";
import { SuppliersView } from "@/components/suppliers/suppliers-view";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const auth = await requirePermissionPage("suppliers.view");
  const t = await getTranslations("suppliers");
  const locale = (await getLocale()) as Locale;
  const suppliers = await getSuppliersWithBalance(auth.user.orgId);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("title")} description={t("subtitle", { count: suppliers.length })} />
      <SuppliersView
        suppliers={suppliers}
        locale={locale}
        permissions={{
          manage: auth.permissions.has("suppliers.manage"),
          pay: auth.permissions.has("suppliers.pay"),
        }}
      />
    </div>
  );
}
