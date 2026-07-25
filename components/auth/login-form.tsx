"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";

import { loginAction } from "@/lib/actions/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth");
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          required
          autoFocus
          className="h-10"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-10 pe-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            className="absolute end-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t.has(`errors.${state.error}`) ? t(`errors.${state.error}`) : t("errors.generic")}
        </p>
      )}

      <Button type="submit" size="lg" className="h-10 w-full" loading={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>

      <p className="text-center text-xs text-muted-foreground">{t("forgotPasswordHint")}</p>
    </form>
  );
}
