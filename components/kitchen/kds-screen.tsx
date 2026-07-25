"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ChefHat, Flame, RotateCcw, StickyNote, Wifi, WifiOff } from "lucide-react";

import { updateOrderStatusAction } from "@/lib/actions/orders";
import { minutesSince } from "@/lib/dates";
import type { OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebouncedRefresh, useOrderEvents } from "@/components/realtime/use-order-events";

export interface KdsOrder {
  id: string;
  number: string;
  type: string;
  status: "confirmed" | "preparing" | "ready";
  tableName: string | null;
  customerName: string | null;
  notes: string | null;
  since: string;
  items: {
    id: string;
    qty: number;
    name: string;
    variantName: string | null;
    modifiers: string[];
    notes: string | null;
    children: string[];
  }[];
}

const COLUMNS: { status: KdsOrder["status"]; accent: string }[] = [
  { status: "confirmed", accent: "border-chart-2 text-chart-2" },
  { status: "preparing", accent: "border-warning text-warning" },
  { status: "ready", accent: "border-success text-success" },
];

export function KdsScreen({
  orders,
  branchId,
  branchName,
  warnAfterMinutes,
  canUpdate,
}: {
  orders: KdsOrder[];
  branchId: string;
  branchName: string;
  warnAfterMinutes: number;
  canUpdate: boolean;
}) {
  const t = useTranslations("kitchen");
  const tp = useTranslations("pos");
  const router = useRouter();
  const [, setTick] = React.useState(0);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // Live clock for elapsed times
  React.useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  // Realtime: refresh on any order event; beep on brand-new orders
  const debouncedRefresh = useDebouncedRefresh(() => router.refresh(), 800);
  const connected = useOrderEvents(branchId, (event) => {
    if (event.type === "order.created") beep();
    debouncedRefresh();
  });

  // Beep also when new ids appear via refresh (covers missed events)
  const knownIds = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (knownIds.current) {
      for (const id of ids) {
        if (!knownIds.current.has(id)) {
          beep();
          break;
        }
      }
    }
    knownIds.current = ids;
  }, [orders]);

  async function advance(order: KdsOrder, next: OrderStatus) {
    setPendingId(order.id);
    const result = await updateOrderStatusAction(order.id, next);
    setPendingId(null);
    if (!result.ok) toast.error(t("actionFailed"));
    router.refresh();
  }

  const byStatus = (status: KdsOrder["status"]) => orders.filter((o) => o.status === status);

  return (
    <div className="dark flex h-dvh flex-col bg-background text-foreground">
      {/* Topbar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <Button variant="ghost" size="iconSm" asChild>
          <Link href="/" aria-label={t("back")}>
            <ArrowLeft className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ChefHat className="h-4 w-4 text-primary" />
          {t("title")}
        </div>
        <Badge variant="secondary">{branchName}</Badge>
        <div className="ms-auto flex items-center gap-2 text-xs">
          {connected ? (
            <span className="flex items-center gap-1.5 text-success">
              <Wifi className="h-3.5 w-3.5" />
              {t("online")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-destructive">
              <WifiOff className="h-3.5 w-3.5" />
              {t("offline")}
            </span>
          )}
        </div>
      </header>

      {/* Columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-y-auto bg-border md:grid-cols-3 md:overflow-hidden">
        {COLUMNS.map(({ status, accent }) => {
          const columnOrders = byStatus(status);
          return (
            <section key={status} className="flex min-h-0 flex-col bg-background">
              <h2
                className={cn(
                  "sticky top-0 z-10 flex items-center justify-between border-b-2 bg-background px-3 py-2 text-sm font-bold uppercase tracking-wider",
                  accent
                )}
              >
                {t(`columns.${status}`)}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground tabular">
                  {columnOrders.length}
                </span>
              </h2>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin">
                {columnOrders.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground/60">{t("empty")}</div>
                )}
                {columnOrders.map((order) => (
                  <KdsCard
                    key={order.id}
                    order={order}
                    warnAfterMinutes={warnAfterMinutes}
                    pending={pendingId === order.id}
                    canUpdate={canUpdate}
                    onAdvance={advance}
                    typeLabel={tp(`types.${order.type}`)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KdsCard({
  order,
  warnAfterMinutes,
  pending,
  canUpdate,
  onAdvance,
  typeLabel,
}: {
  order: KdsOrder;
  warnAfterMinutes: number;
  pending: boolean;
  canUpdate: boolean;
  onAdvance: (order: KdsOrder, next: OrderStatus) => void;
  typeLabel: string;
}) {
  const t = useTranslations("kitchen");
  const elapsed = minutesSince(new Date(order.since));
  const late = elapsed >= warnAfterMinutes && order.status !== "ready";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border-2 bg-card shadow-lg",
        order.status === "confirmed" && "border-chart-2/70",
        order.status === "preparing" && "border-warning/70",
        order.status === "ready" && "border-success/70 opacity-90",
        late && "animate-pulse border-destructive"
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="text-xl font-extrabold tracking-tight tabular">#{order.number}</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {order.tableName ? `${t("tableShort")} ${order.tableName}` : typeLabel}
          </Badge>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-sm font-bold tabular",
              late ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"
            )}
          >
            {late && <Flame className="me-1 inline h-3.5 w-3.5" />}
            {elapsed} {t("min")}
          </span>
        </div>
      </header>

      <ul className="divide-y divide-border/60 px-3">
        {order.items.map((item) => (
          <li key={item.id} className="py-2">
            <div className="flex items-start gap-2 text-lg font-semibold leading-snug">
              <span className="shrink-0 text-primary tabular">{item.qty} ×</span>
              <span>
                {item.name}
                {item.variantName && <span className="ms-1.5 text-base font-medium text-warning">({item.variantName})</span>}
              </span>
            </div>
            {item.children.map((child, i) => (
              <div key={i} className="ms-7 text-sm text-muted-foreground">
                • {child}
              </div>
            ))}
            {item.modifiers.map((modifier, i) => (
              <div key={i} className="ms-7 text-sm font-medium text-chart-2">
                + {modifier}
              </div>
            ))}
            {item.notes && (
              <div className="ms-7 mt-0.5 flex items-center gap-1 text-sm font-bold text-warning">
                <StickyNote className="h-3.5 w-3.5" />
                {item.notes.toUpperCase()}
              </div>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <div className="mx-3 mb-2 rounded-md bg-warning/15 px-2 py-1.5 text-sm font-semibold text-warning">
          {order.notes}
        </div>
      )}

      {canUpdate && (
        <footer className="p-2.5 pt-1">
          {order.status === "confirmed" && (
            <Button size="xl" className="w-full text-base font-bold" loading={pending} onClick={() => onAdvance(order, "preparing")}>
              {t("actions.start")}
            </Button>
          )}
          {order.status === "preparing" && (
            <Button
              size="xl"
              className="w-full bg-success text-base font-bold text-success-foreground hover:bg-success/90"
              loading={pending}
              onClick={() => onAdvance(order, "ready")}
            >
              {t("actions.ready")}
            </Button>
          )}
          {order.status === "ready" && (
            <Button variant="outline" size="lg" className="w-full" loading={pending} onClick={() => onAdvance(order, "preparing")}>
              <RotateCcw />
              {t("actions.recall")}
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}

/** Short attention beep (WebAudio — no asset). Silently ignored pre-interaction. */
function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => ctx.close();
  } catch {
    // audio unavailable — fine
  }
}
