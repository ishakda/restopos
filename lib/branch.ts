import "server-only";

import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { BRANCH_COOKIE } from "@/lib/constants";
import type { AuthContext } from "@/lib/auth/session";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

/** Branches this user may work in (own branch, or all when unrestricted). */
export async function getAccessibleBranches(auth: AuthContext): Promise<BranchOption[]> {
  const branches = await db.branch.findMany({
    where: {
      orgId: auth.user.orgId,
      isActive: true,
      ...(auth.user.branchId ? { id: auth.user.branchId } : {}),
    },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });
  return branches;
}

/**
 * The branch the user is currently operating in.
 * Users pinned to a branch always get that branch; unrestricted users get
 * their cookie choice (validated) or the first branch.
 */
export async function getActiveBranch(auth: AuthContext): Promise<BranchOption> {
  const accessible = await getAccessibleBranches(auth);
  if (accessible.length === 0) {
    throw new Error("No active branch available for this user");
  }
  if (auth.user.branchId) return accessible[0]!;

  const store = await cookies();
  const cookieBranch = store.get(BRANCH_COOKIE)?.value;
  const match = accessible.find((b) => b.id === cookieBranch);
  return match ?? accessible[0]!;
}
