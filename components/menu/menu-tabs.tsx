"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "products", href: "/menu" },
  { key: "categories", href: "/menu/categories" },
  { key: "modifiers", href: "/menu/modifiers" },
] as const;

export function MenuTabs() {
  const t = useTranslations("menu.tabs");
  const pathname = usePathname();

  // Hide tab chrome inside the product editor (full-page form)
  if (pathname.startsWith("/menu/products/")) return null;

  return (
    <div className="mb-6 flex items-center gap-1 border-b">
      {TABS.map((tab) => {
        const active = tab.href === "/menu" ? pathname === "/menu" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
