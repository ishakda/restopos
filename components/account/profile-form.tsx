"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { updateProfileAction } from "@/lib/actions/auth";
import { localeNames, locales } from "@/lib/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProfileForm({
  defaultName,
  email,
  defaultLocale,
}: {
  defaultName: string;
  email: string;
  defaultLocale: string | null;
}) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const activeLocale = useLocale();
  const router = useRouter();
  const [locale, setLocale] = React.useState(defaultLocale ?? activeLocale);

  const [state, formAction, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await updateProfileAction(prev, formData);
      if (result.ok) {
        toast.success(t("profile_saved"));
        router.refresh();
      }
      return result;
    },
    null
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" defaultValue={defaultName} required minLength={2} maxLength={80} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" value={email} disabled readOnly />
        <p className="text-xs text-muted-foreground">{t("emailReadonly")}</p>
      </div>

      <div className="grid gap-2">
        <Label>{t("language")}</Label>
        <input type="hidden" name="locale" value={locale} />
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((l) => (
              <SelectItem key={l} value={l}>
                {localeNames[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state && !state.ok && <p className="text-sm text-destructive">{tc("error")}</p>}

      <div>
        <Button type="submit" loading={pending}>
          {pending ? tc("saving") : tc("save")}
        </Button>
      </div>
    </form>
  );
}
