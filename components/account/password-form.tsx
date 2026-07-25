"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { changePasswordAction } from "@/lib/actions/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FieldErrors({ errors }: { errors?: string[] }) {
  const t = useTranslations("auth.rules");
  if (!errors || errors.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs text-destructive">
      {errors.map((key) => (
        <li key={key}>{t.has(key) ? t(key) : key}</li>
      ))}
    </ul>
  );
}

export function PasswordForm() {
  const t = useTranslations("account");
  const te = useTranslations("auth.errors");

  const [state, formAction, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await changePasswordAction(prev, formData);
      if (result.ok) {
        toast.success(t("password_changed_success"));
      }
      return result;
    },
    null
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4" autoComplete="off">
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
        <FieldErrors errors={fieldErrors?.currentPassword} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="newPassword">{t("newPassword")}</Label>
          <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" />
          <FieldErrors errors={fieldErrors?.newPassword} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
          <FieldErrors errors={fieldErrors?.confirmPassword} />
        </div>
      </div>

      {state && !state.ok && !fieldErrors && (
        <p className="text-sm text-destructive">{te.has(state.error) ? te(state.error) : te("generic")}</p>
      )}

      <div>
        <Button type="submit" loading={pending}>
          {t("changePassword")}
        </Button>
      </div>
    </form>
  );
}
