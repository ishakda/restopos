/**
 * Permission catalog + default role → permission mapping.
 * Pure module (no DB imports) so it is unit-testable and usable in seeds.
 *
 * The catalog is seeded into the `permissions` table; the owner/admin can then
 * reconfigure any role's permissions from the UI. `hasPermission` is the single
 * check used by the server — the client NEVER decides authorization.
 */

import type { SystemRoleKey } from "@/lib/constants";

export interface PermissionDef {
  code: string;
  module: string;
}

function p(module: string, actions: string[]): PermissionDef[] {
  return actions.map((a) => ({ code: `${module}.${a}`, module }));
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  ...p("dashboard", ["view"]),
  ...p("pos", ["use"]),
  ...p("orders", ["view", "create", "update", "cancel", "refund", "discount"]),
  ...p("kitchen", ["view", "update"]),
  ...p("tables", ["view", "manage", "edit_floor"]),
  ...p("menu", ["view", "manage"]),
  ...p("inventory", ["view", "adjust", "transfer"]),
  ...p("waste", ["view", "create"]),
  ...p("purchases", ["view", "manage", "receive"]),
  ...p("suppliers", ["view", "manage", "pay"]),
  ...p("customers", ["view", "manage"]),
  ...p("loyalty", ["view", "manage"]),
  ...p("promotions", ["view", "manage"]),
  ...p("payments", ["take", "void"]),
  ...p("cash", ["open", "close", "movement", "view_all"]),
  ...p("expenses", ["view", "manage"]),
  ...p("employees", ["view", "manage", "attendance"]),
  ...p("reports", ["view", "profit", "export"]),
  ...p("settings", ["view", "manage"]),
  ...p("users", ["view", "manage"]),
  ...p("roles", ["manage"]),
  ...p("branches", ["manage"]),
  ...p("audit", ["view"]),
];

export const ALL_PERMISSION_CODES = PERMISSION_CATALOG.map((x) => x.code);

const ALL = [...ALL_PERMISSION_CODES];

/**
 * Default permission sets for the 8 system roles (still editable in the UI).
 * Spec anchors:
 *  - Cashier: create orders, take payments, print receipts; NO profit reports,
 *    NO manual stock modification.
 *  - Kitchen: kitchen orders + preparation status only; NO financial info.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRoleKey, string[]> = {
  owner: ALL,
  administrator: ALL,
  manager: ALL.filter((c) => !["roles.manage", "branches.manage", "settings.manage"].includes(c)),
  cashier: [
    "pos.use",
    "orders.view",
    "orders.create",
    "orders.update",
    "payments.take",
    "cash.open",
    "cash.close",
    "cash.movement",
    "customers.view",
    "customers.manage",
    "tables.view",
    "tables.manage",
    "waste.create",
  ],
  waiter: [
    "pos.use",
    "orders.view",
    "orders.create",
    "orders.update",
    "tables.view",
    "tables.manage",
    "customers.view",
  ],
  kitchen: ["kitchen.view", "kitchen.update"],
  delivery: ["orders.view", "orders.update"],
  stock_manager: [
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "waste.view",
    "waste.create",
    "purchases.view",
    "purchases.manage",
    "purchases.receive",
    "suppliers.view",
    "suppliers.manage",
    "suppliers.pay",
    "menu.view",
  ],
};

/** Display names (per locale) for seeded system roles. */
export const SYSTEM_ROLE_NAMES: Record<SystemRoleKey, string> = {
  owner: "Propriétaire",
  administrator: "Administrateur",
  manager: "Manager",
  cashier: "Caissier",
  waiter: "Serveur",
  kitchen: "Cuisine",
  delivery: "Livreur",
  stock_manager: "Magasinier",
};

export function hasPermission(granted: ReadonlySet<string> | string[], code: string): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(code);
}

export function isValidPermissionCode(code: string): boolean {
  return ALL_PERMISSION_CODES.includes(code);
}
