/**
 * Domain constants — the schema stores these as strings (SQLite has no enums);
 * every write MUST validate against these lists (zod schemas use them).
 */

export const ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "served",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that mean the order still occupies the kitchen/floor. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "served",
  "out_for_delivery",
];

export const ORDER_ITEM_STATUSES = ["new", "preparing", "ready", "served", "cancelled"] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRODUCT_TYPES = ["simple", "combo"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const STOCK_MOVEMENT_TYPES = [
  "purchase",
  "sale",
  "adjustment",
  "waste",
  "damage",
  "transfer_in",
  "transfer_out",
  "return",
  "reversal",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const WASTE_REASONS = ["expired", "damaged", "prep_error", "customer_return", "other"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const PO_STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const TABLE_STATUSES = ["available", "occupied", "reserved", "awaiting_payment", "cleaning"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const CASH_MOVEMENT_TYPES = ["opening", "sale", "refund", "cash_in", "cash_out", "expense"] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const PROMOTION_TYPES = ["percent", "fixed", "bogo"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_SCOPES = ["order", "category", "product"] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

export const LOYALTY_TX_TYPES = ["earn", "redeem", "adjust", "expire"] as const;
export type LoyaltyTxType = (typeof LOYALTY_TX_TYPES)[number];

export const BASE_UNITS = ["g", "ml", "unit"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const DISPLAY_UNITS = ["g", "kg", "ml", "L", "unit"] as const;
export type DisplayUnit = (typeof DISPLAY_UNITS)[number];

export const PAYMENT_METHOD_TYPES = ["cash", "card", "other"] as const;

export const PRINTER_TYPES = ["receipt", "kitchen"] as const;
export const PAPER_WIDTHS = [58, 80] as const;

// --- Cookies -----------------------------------------------------------------

export const SESSION_COOKIE = "rp_session";
export const LOCALE_COOKIE = "rp_locale";
export const BRANCH_COOKIE = "rp_branch";

// --- Session lifetimes ---------------------------------------------------------

export const SESSION_TTL_HOURS = 24;
/** Sliding renewal: extend when less than half the TTL remains. */
export const SESSION_RENEW_THRESHOLD_MS = (SESSION_TTL_HOURS / 2) * 3600 * 1000;

// --- Misc ----------------------------------------------------------------------

/** Order-number prefixes per order type (configurable later via settings). */
export const ORDER_NUMBER_PREFIX: Record<OrderType, string> = {
  dine_in: "D",
  takeaway: "A",
  delivery: "L",
};

export const SYSTEM_ROLE_KEYS = [
  "owner",
  "administrator",
  "manager",
  "cashier",
  "waiter",
  "kitchen",
  "delivery",
  "stock_manager",
] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];
