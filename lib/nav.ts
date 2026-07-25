/**
 * Application navigation model. Items are permission-gated server-side and only
 * rendered once their module ships (no dead buttons during the phased build).
 */

export type NavIcon =
  | "dashboard"
  | "pos"
  | "orders"
  | "kitchen"
  | "tables"
  | "menu"
  | "ingredients"
  | "inventory"
  | "movements"
  | "waste"
  | "purchases"
  | "suppliers"
  | "customers"
  | "expenses"
  | "employees"
  | "reports"
  | "settings";

export interface NavItem {
  key: string; // i18n key under "nav"
  href: string;
  icon: NavIcon;
  permission: string;
  /** flips to true as each phase ships */
  implemented: boolean;
}

export interface NavGroup {
  key: string; // i18n key under "nav"
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "groupOperations",
    items: [
      { key: "dashboard", href: "/", icon: "dashboard", permission: "dashboard.view", implemented: true },
      { key: "pos", href: "/pos", icon: "pos", permission: "pos.use", implemented: false },
      { key: "orders", href: "/orders", icon: "orders", permission: "orders.view", implemented: false },
      { key: "kitchen", href: "/kitchen", icon: "kitchen", permission: "kitchen.view", implemented: false },
      { key: "tables", href: "/tables", icon: "tables", permission: "tables.view", implemented: false },
    ],
  },
  {
    key: "groupCatalog",
    items: [
      { key: "menu", href: "/menu", icon: "menu", permission: "menu.view", implemented: false },
      { key: "ingredients", href: "/ingredients", icon: "ingredients", permission: "inventory.view", implemented: false },
      { key: "inventory", href: "/inventory", icon: "inventory", permission: "inventory.view", implemented: false },
      { key: "stockMovements", href: "/inventory/movements", icon: "movements", permission: "inventory.view", implemented: false },
      { key: "waste", href: "/waste", icon: "waste", permission: "waste.view", implemented: false },
      { key: "purchases", href: "/purchases", icon: "purchases", permission: "purchases.view", implemented: false },
      { key: "suppliers", href: "/suppliers", icon: "suppliers", permission: "suppliers.view", implemented: false },
    ],
  },
  {
    key: "groupBusiness",
    items: [
      { key: "customers", href: "/customers", icon: "customers", permission: "customers.view", implemented: false },
      { key: "expenses", href: "/expenses", icon: "expenses", permission: "expenses.view", implemented: false },
      { key: "employees", href: "/employees", icon: "employees", permission: "employees.view", implemented: false },
      { key: "reports", href: "/reports", icon: "reports", permission: "reports.view", implemented: false },
    ],
  },
  {
    key: "groupSystem",
    items: [
      { key: "settings", href: "/settings", icon: "settings", permission: "settings.view", implemented: false },
    ],
  },
];

/**
 * The home item is visible to every authenticated user even without
 * dashboard.view (they land somewhere harmless); financial dashboard data
 * itself is still gated by dashboard.view at render time.
 */
export function navGroupsFor(permissions: ReadonlySet<string>): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => i.implemented && (permissions.has(i.permission) || (i.key === "dashboard" && true))
    ),
  })).filter((g) => g.items.length > 0);
}
