import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";

import { requireAuth } from "@/lib/auth/session";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";

export default async function AccountPage() {
  const auth = await requireAuth();
  const t = await getTranslations("account");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {auth.user.mustChangePassword && (
        <Alert variant="warning" className="mb-6">
          <ShieldAlert />
          <AlertTitle>{t("security")}</AlertTitle>
          <AlertDescription>{t("mustChangeNotice")}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile")}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{t("role")}: {auth.user.roleName}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaultName={auth.user.name}
              email={auth.user.email}
              defaultLocale={auth.user.locale}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("security")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
