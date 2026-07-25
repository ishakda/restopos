import { getTranslations } from "next-intl/server";
import { ChefHat } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { LoginLocaleSwitcher } from "@/components/auth/locale-switcher";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -end-40 h-[480px] w-[480px] rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-52 -start-32 h-[420px] w-[420px] rounded-full bg-primary/15 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">RestoPOS</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">{t("app.tagline")}</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">{t("app.taglineLong")}</p>
        </div>

        <div className="relative flex items-center gap-4 text-xs text-white/50">
          <span>POS</span>
          <span aria-hidden>·</span>
          <span>Kitchen</span>
          <span aria-hidden>·</span>
          <span>Stock</span>
          <span aria-hidden>·</span>
          <span>العربية · Français · English</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="h-4 w-4" />
            </div>
            <span className="font-semibold">RestoPOS</span>
          </div>
          <div className="ms-auto">
            <LoginLocaleSwitcher />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.loginTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.loginSubtitle")}</p>
            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
