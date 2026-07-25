import { headers } from "next/headers";

import { db } from "@/lib/db";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0] | typeof db;

export interface AuditEntry {
  orgId: string;
  branchId?: string | null;
  userId?: string | null;
  /** e.g. "order.cancel", "stock.adjust", "auth.login_failed" */
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Write an audit row. Pass the transaction client when the audited operation
 * runs in a transaction so the trail commits atomically with the change.
 */
export async function writeAudit(entry: AuditEntry, tx: Tx = db): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent")?.slice(0, 255) ?? null;
  } catch {
    // headers() unavailable outside a request scope (e.g. seeds/tests)
  }

  await tx.auditLog.create({
    data: {
      orgId: entry.orgId,
      branchId: entry.branchId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
      ip,
      userAgent,
    },
  });
}
