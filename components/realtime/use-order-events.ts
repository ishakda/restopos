"use client";

import * as React from "react";

import type { OrderEvent } from "@/lib/events";

/**
 * Subscribe to the branch event stream. Returns the connection state
 * (drives ONLINE/OFFLINE indicators). EventSource reconnects automatically.
 */
export function useOrderEvents(branchId: string, onEvent?: (event: OrderEvent) => void): boolean {
  const [connected, setConnected] = React.useState(false);
  const handlerRef = React.useRef(onEvent);
  handlerRef.current = onEvent;

  React.useEffect(() => {
    if (!branchId) return;
    const source = new EventSource(`/api/events?branch=${encodeURIComponent(branchId)}`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data) as OrderEvent | { type: "connected" };
        if (data.type === "connected") {
          setConnected(true);
          return;
        }
        handlerRef.current?.(data as OrderEvent);
      } catch {
        // ignore malformed frames
      }
    };

    return () => source.close();
  }, [branchId]);

  return connected;
}

/** router.refresh() at most once per second, trailing-edge. */
export function useDebouncedRefresh(refresh: () => void, delayMs = 1000): () => void {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return React.useCallback((): void => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      refreshRef.current();
    }, delayMs);
  }, [delayMs]);
}
