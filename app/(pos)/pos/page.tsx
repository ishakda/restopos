import { requirePermissionPage } from "@/lib/auth/session";
import { getActiveBranch } from "@/lib/branch";
import { getPosData } from "@/lib/pos-queries";

import { PosScreen } from "@/components/pos/pos-screen";

export const metadata = { title: "POS" };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const auth = await requirePermissionPage("pos.use");
  const branch = await getActiveBranch(auth);
  const data = await getPosData(auth.user.orgId, branch.id);
  const { table } = await searchParams;

  return (
    <PosScreen
      data={data}
      branchId={branch.id}
      branchName={branch.name}
      userName={auth.user.name}
      canDiscount={auth.permissions.has("orders.discount")}
      canPay={auth.permissions.has("payments.take")}
      initialTableId={table ?? null}
    />
  );
}
