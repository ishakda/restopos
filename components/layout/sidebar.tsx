"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChefHat } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav";
import { NAV_ICONS } from "@/components/layout/nav-icons";

export function SidebarNav({
  groups,
  orgName,
  onNavigate,
}: {
  groups: NavGroup[];
  orgName: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <ChefHat className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">RestoPOS</div>
          <div className="truncate text-[11px] leading-tight text-sidebar-foreground/70">{orgName}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3 scrollbar-thin">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
              {t(group.key)}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active =
                  item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t(item.key)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 text-[11px] text-sidebar-foreground/50">
        RestoPOS · v0.1
      </div>
    </div>
  );
}

export function DesktopSidebar(props: { groups: NavGroup[]; orgName: string }) {
  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 border-e border-sidebar-border md:block">
      <SidebarNav {...props} />
    </aside>
  );
}
