/**
 * Order lifecycle — single source of truth for allowed transitions.
 * Client-safe (no server imports); the server enforces, the UI renders.
 *
 * NEW → CONFIRMED → PREPARING → READY → SERVED / OUT_FOR_DELIVERY → COMPLETED
 * (+ CANCELLED at any pre-completed point, permission-gated)
 */

import type { OrderStatus, OrderType } from "@/lib/constants";

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  // "preparing" here = kitchen recall (READY → back on the pass)
  ready: ["served", "out_for_delivery", "completed", "preparing", "cancelled"],
  served: ["completed", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The "hand over" status that fits the order type (READY → …). */
export function handoverStatusFor(type: OrderType): OrderStatus {
  return type === "delivery" ? "out_for_delivery" : "served";
}

/** Statuses that still occupy kitchen/floor resources. */
export function isOpenStatus(status: OrderStatus): boolean {
  return !["completed", "cancelled"].includes(status);
}

/** Next PRIMARY action to advance an order, per type (POS flow). */
export function nextPrimaryStatus(status: OrderStatus, type: OrderType): OrderStatus | null {
  switch (status) {
    case "new":
      return "confirmed";
    case "confirmed":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return handoverStatusFor(type);
    case "served":
    case "out_for_delivery":
      return "completed";
    default:
      return null;
  }
}

export type BadgeVariant = "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "outline";

export const ORDER_STATUS_BADGE: Record<OrderStatus, BadgeVariant> = {
  new: "secondary",
  confirmed: "info",
  preparing: "warning",
  ready: "success",
  served: "default",
  out_for_delivery: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export const PAYMENT_STATUS_BADGE: Record<string, BadgeVariant> = {
  unpaid: "destructive",
  partial: "warning",
  paid: "success",
  refunded: "secondary",
};

export const TABLE_STATUS_COLOR: Record<string, string> = {
  available: "border-success/50 bg-success/10 text-success",
  occupied: "border-primary/60 bg-primary/10 text-primary",
  reserved: "border-chart-2/60 bg-chart-2/10 text-chart-3",
  awaiting_payment: "border-warning/70 bg-warning/15 text-warning-foreground",
  cleaning: "border-muted-foreground/40 bg-muted text-muted-foreground",
};
