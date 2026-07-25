/**
 * In-process realtime event bus (POS ↔ KDS ↔ back-office).
 *
 * Single-node by design: server actions emit after their transaction commits,
 * the SSE route (app/api/events) fans events out to subscribed browsers.
 * Scale-out path (documented in docs/DEPLOYMENT.md): replace this module with
 * a Redis pub/sub implementation behind the same three functions.
 */

import { EventEmitter } from "node:events";

export interface OrderEvent {
  type: "order.created" | "order.updated" | "order.cancelled" | "payment.taken" | "stock.alert";
  branchId: string;
  orderId?: string;
  number?: string;
  status?: string;
  orderType?: string;
  /** human label for non-order events (e.g. ingredient name on stock.alert) */
  label?: string;
  at: string;
}

const globalForBus = globalThis as unknown as { __rpBus?: EventEmitter };

const bus =
  globalForBus.__rpBus ??
  (globalForBus.__rpBus = (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(1000); // one listener per open screen
    return emitter;
  })());

function channel(branchId: string) {
  return `branch:${branchId}`;
}

export function emitOrderEvent(event: Omit<OrderEvent, "at">): void {
  const full: OrderEvent = { ...event, at: new Date().toISOString() };
  // Fire-and-forget: realtime is best-effort, the DB is the source of truth.
  try {
    bus.emit(channel(event.branchId), full);
  } catch {
    // never let a notification failure break a financial action
  }
}

export function subscribeToBranch(branchId: string, listener: (event: OrderEvent) => void): () => void {
  const ch = channel(branchId);
  bus.on(ch, listener);
  return () => bus.off(ch, listener);
}
