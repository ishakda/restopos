"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, LogOut, Menu, Store, UserRound } from "lucide-react";

import { logoutAction, setActiveBranchAction, setLocaleAction } from "@/lib/actions/auth";
import { localeNames, locales } from "@/lib/locale";
import type { NavGroup } from "@/lib/nav";
import type { BranchOption } from "@/lib/branch";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar";

interface TopbarProps {
  userName: string;
  roleName: string;
  branches: BranchOption[];
  activeBranchId: string;
  branchLocked: boolean;
  groups: NavGroup[];
  orgName: string;
}

export function Topbar({ userName, roleName, branches, activeBranchId, branchLocked, groups, orgName }: TopbarProps) {
  const t = useTranslations("topbar");
  const locale = useLocale();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [pendingBranch, startBranch] = React.useTransition();

  const initials = userName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function onLocaleChange(next: string) {
    await setLocaleAction(next);
    router.refresh();
  }

  function onBranchChange(id: string) {
    startBranch(async () => {
      await setActiveBranchAction(id);
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("openMenu")}>
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side={locale === "ar" ? "right" : "left"} className="w-72 p-0">
          <SheetTitle className="sr-only">RestoPOS</SheetTitle>
          <SidebarNav groups={groups} orgName={orgName} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      {branches.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Store className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <Select value={activeBranchId} onValueChange={onBranchChange} disabled={branchLocked || pendingBranch}>
            <SelectTrigger className="h-8 w-auto min-w-36 gap-2 border-none bg-muted/60 text-xs font-medium shadow-none sm:min-w-44 sm:text-sm">
              <SelectValue placeholder={t("branch")} />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("language")}>
            <Globe className="h-4.5 w-4.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={onLocaleChange}>
            {locales.map((l) => (
              <DropdownMenuRadioItem key={l} value={l}>
                {localeNames[l]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full outline-none ring-ring focus-visible:ring-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{userName}</div>
            <div className="text-xs text-muted-foreground">{roleName}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/account")}>
            <UserRound />
            {t("myAccount")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => logoutAction()}
          >
            <LogOut />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
