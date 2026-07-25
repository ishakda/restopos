import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSION_CODES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  hasPermission,
  isValidPermissionCode,
} from "@/lib/permissions";
import { SYSTEM_ROLE_KEYS } from "@/lib/constants";

describe("permission catalog", () => {
  it("has unique codes", () => {
    const codes = PERMISSION_CATALOG.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every default role permission exists in the catalog", () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      for (const code of DEFAULT_ROLE_PERMISSIONS[key]) {
        expect(isValidPermissionCode(code), `${key} → ${code}`).toBe(true);
      }
    }
  });
});

describe("spec-anchored role defaults", () => {
  it("cashier can sell but cannot see profit reports or adjust stock", () => {
    const cashier = new Set(DEFAULT_ROLE_PERMISSIONS.cashier);
    expect(cashier.has("orders.create")).toBe(true);
    expect(cashier.has("payments.take")).toBe(true);
    // spec: cannot view profit reports
    expect(cashier.has("reports.profit")).toBe(false);
    expect(cashier.has("reports.view")).toBe(false);
    expect(cashier.has("dashboard.view")).toBe(false);
    // spec: cannot modify stock manually
    expect(cashier.has("inventory.adjust")).toBe(false);
  });

  it("kitchen sees kitchen only — no financials", () => {
    const kitchen = new Set(DEFAULT_ROLE_PERMISSIONS.kitchen);
    expect(kitchen.has("kitchen.view")).toBe(true);
    expect(kitchen.has("kitchen.update")).toBe(true);
    expect(kitchen.size).toBe(2);
  });

  it("owner and administrator have every permission", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner.length).toBe(ALL_PERMISSION_CODES.length);
    expect(DEFAULT_ROLE_PERMISSIONS.administrator.length).toBe(ALL_PERMISSION_CODES.length);
  });

  it("manager cannot manage roles or branches", () => {
    const manager = new Set(DEFAULT_ROLE_PERMISSIONS.manager);
    expect(manager.has("roles.manage")).toBe(false);
    expect(manager.has("branches.manage")).toBe(false);
    expect(manager.has("reports.profit")).toBe(true);
    expect(manager.has("audit.view")).toBe(true);
  });

  it("stock manager has no sales or financial permissions", () => {
    const stock = new Set(DEFAULT_ROLE_PERMISSIONS.stock_manager);
    expect(stock.has("inventory.adjust")).toBe(true);
    expect(stock.has("purchases.receive")).toBe(true);
    expect(stock.has("pos.use")).toBe(false);
    expect(stock.has("payments.take")).toBe(false);
    expect(stock.has("reports.profit")).toBe(false);
  });
});

describe("hasPermission", () => {
  it("works with Set and array inputs", () => {
    expect(hasPermission(new Set(["orders.create"]), "orders.create")).toBe(true);
    expect(hasPermission(["orders.create"], "orders.view")).toBe(false);
  });
});
