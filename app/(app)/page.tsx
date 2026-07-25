import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Building2, CheckCircle2, CircleDashed, Store, UserRound } from "lucide-react";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Landing page (Phase 1). The full real-time dashboard ships in Phase 8 —
 * until then this page shows only real account/organization facts and the
 * honest rollout status of each module. No fake metrics, ever.
 */

const MODULE_STATUS: { key: string; done: boolean }[] = [
  { key: "auth", done: true },
  { key: "menu", done: false },
  { key: "pos", done: false },
  { key: "kitchen", done: false },
  { key: "inventory", done: false },
  { key: "crm", done: false },
  { key: "cash", done: false },
  { key: "reports", done: false },
  { key: "multibranch", done: false },
];

export default async function HomePage() {
  const auth = await requireAuth();
  if (auth.user.mustChangePassword) redirect("/account");

  const t = await getTranslations("home");
  const format = await getFormatter();

  const [org, branchCount, activeBranch] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: auth.user.orgId }, select: { name: true } }),
    db.branch.count({ where: { orgId: auth.user.orgId, isActive: true } }),
    getActiveBranch(auth),
  ]);

  const today = format.dateTime(new Date(), { dateStyle: "full" });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("welcome", { name: auth.user.name.split(" ")[0] ?? auth.user.name })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { org: org.name })} · {today}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" /> {t("yourBranch")}
            </CardDescription>
            <CardTitle className="text-lg">{activeBranch.name}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" /> {t("yourRole")}
            </CardDescription>
            <CardTitle className="text-lg">{auth.user.roleName}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {t("organization")}
            </CardDescription>
            <CardTitle className="text-lg">{t("branchCount", { count: branchCount })}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("buildProgress")}</CardTitle>
          <CardDescription>{t("buildProgressHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {MODULE_STATUS.map((m) => (
              <li key={m.key} className="flex items-center gap-2.5 text-sm">
                {m.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                )}
                <span className={m.done ? "" : "text-muted-foreground"}>{t(`modules.${m.key}`)}</span>
                <Badge variant={m.done ? "success" : "secondary"} className="ms-auto">
                  {m.done ? t("phaseDone") : t("phaseUpcoming")}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
