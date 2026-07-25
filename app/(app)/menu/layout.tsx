import { requirePermissionPage } from "@/lib/auth/session";
import { MenuTabs } from "@/components/menu/menu-tabs";

export default async function MenuLayout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage("menu.view");
  return (
    <div className="mx-auto max-w-6xl">
      <MenuTabs />
      {children}
    </div>
  );
}
