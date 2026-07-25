import { requireAuth } from "@/lib/auth/session";
import { getAccessibleBranches, getActiveBranch } from "@/lib/branch";
import { navGroupsFor } from "@/lib/nav";
import { db } from "@/lib/db";

import { DesktopSidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  const [org, branches, activeBranch] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: auth.user.orgId }, select: { name: true } }),
    getAccessibleBranches(auth),
    (async () => {
      const a = await getActiveBranch(auth);
      return a;
    })(),
  ]);

  const groups = navGroupsFor(auth.permissions);

  return (
    <div className="min-h-dvh">
      <DesktopSidebar groups={groups} orgName={org.name} />
      <div className="flex min-h-dvh flex-col md:ps-64">
        <Topbar
          userName={auth.user.name}
          roleName={auth.user.roleName}
          branches={branches}
          activeBranchId={activeBranch.id}
          branchLocked={Boolean(auth.user.branchId) || branches.length <= 1}
          groups={groups}
          orgName={org.name}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
