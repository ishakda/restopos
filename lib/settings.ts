import "server-only";

import { db } from "@/lib/db";

/**
 * Typed settings reader with defaults. Values are stored as JSON strings in
 * the Setting table (scope "org" or a branchId; branch overrides org).
 */

export interface OrgSettings {
  "pos.defaultOrderType": "dine_in" | "takeaway" | "delivery";
  "tax.mode": "inclusive" | "exclusive";
  "tax.defaultRate": number;
  "receipt.footer": string;
  "receipt.showLogo": boolean;
  "stock.negativePolicy": "block" | "allow";
  "kitchen.warnAfterMinutes": number;
  "loyalty.enabled": boolean;
  "loyalty.earnPer100Da": number;
  "loyalty.pointValueCentimes": number;
}

export const SETTING_DEFAULTS: OrgSettings = {
  "pos.defaultOrderType": "takeaway",
  "tax.mode": "inclusive",
  "tax.defaultRate": 0,
  "receipt.footer": "Merci pour votre visite",
  "receipt.showLogo": true,
  "stock.negativePolicy": "block",
  "kitchen.warnAfterMinutes": 15,
  "loyalty.enabled": false,
  "loyalty.earnPer100Da": 1,
  "loyalty.pointValueCentimes": 100,
};

export async function getSettings(orgId: string, branchId?: string): Promise<OrgSettings> {
  const rows = await db.setting.findMany({
    where: { orgId, scope: { in: branchId ? ["org", branchId] : ["org"] } },
  });

  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS };
  // org first, then branch overrides
  for (const pass of ["org", branchId] as const) {
    if (!pass) continue;
    for (const row of rows) {
      if (row.scope !== pass) continue;
      try {
        merged[row.key] = JSON.parse(row.value);
      } catch {
        // ignore malformed rows; defaults win
      }
    }
  }
  return merged as unknown as OrgSettings;
}

export async function getSetting<K extends keyof OrgSettings>(
  orgId: string,
  key: K,
  branchId?: string
): Promise<OrgSettings[K]> {
  const all = await getSettings(orgId, branchId);
  return all[key];
}
