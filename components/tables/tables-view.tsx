"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  BrushCleaning,
  CalendarClock,
  CheckCircle2,
  Clock,
  Merge,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

import { moveOrderToTableAction, mergeOrdersAction, requestBillAction } from "@/lib/actions/orders";
import { deleteTableAction, saveTableAction, setTableStatusAction } from "@/lib/actions/tables";
import { formatMoney } from "@/lib/money";
import { minutesSince } from "@/lib/dates";
import { TABLE_STATUS_COLOR } from "@/lib/order-status";
import type { Locale } from "@/lib/locale";
import type { OrderDetailData } from "@/lib/order-detail";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OrderDetailSheet, type OrderSheetPermissions } from "@/components/orders/order-detail-sheet";
import { useDebouncedRefresh, useOrderEvents } from "@/components/realtime/use-order-events";

export interface FloorOrder {
  id: string;
  number: string;
  total: number;
  paidAmount: number;
  guestCount: number | null;
  waiterName: string | null;
  itemCount: number;
  createdAt: string;
}

export interface FloorTable {
  id: string;
  name: string;
  seats: number;
  zone: string | null;
  status: string;
  orders: FloorOrder[];
}

interface PaymentMethodOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface TablesPermissions extends OrderSheetPermissions {
  manage: boolean;
  editFloor: boolean;
  pos: boolean;
}

export function TablesView({
  tables,
  branchId,
  detail,
  methods,
  locale,
  permissions,
}: {
  tables: FloorTable[];
  branchId: string;
  detail: OrderDetailData | null;
  methods: PaymentMethodOption[];
  locale: Locale;
  permissions: TablesPermissions;
}) {
  const t = useTranslations("tables");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Live floor: refresh on any branch order/payment event
  const debouncedRefresh = useDebouncedRefresh(() => router.refresh(), 1000);
  useOrderEvents(branchId, () => debouncedRefresh());

  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FloorTable | null>(null);
  const [name, setName] = React.useState("");
  const [seats, setSeats] = React.useState("4");
  const [zone, setZone] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [moveOrder, setMoveOrder] = React.useState<{ order: FloorOrder; fromTable: FloorTable } | null>(null);
  const [mergeSource, setMergeSource] = React.useState<{ order: FloorOrder; table: FloorTable } | null>(null);

  function openOrder(orderId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", orderId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeOrder() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("order");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function errToast(code: string) {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : te.has(code) ? te(code) : te("generic"));
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setSeats("4");
    setZone("");
    setIsActive(true);
    setEditOpen(true);
  }

  function openEdit(table: FloorTable) {
    setEditing(table);
    setName(table.name);
    setSeats(String(table.seats));
    setZone(table.zone ?? "");
    setIsActive(true);
    setEditOpen(true);
  }

  async function onSaveTable() {
    setSaving(true);
    const result = await saveTableAction(branchId, {
      id: editing?.id,
      name: name.trim(),
      seats: Number(seats) || 1,
      zone: zone.trim() || null,
      isActive,
    });
    setSaving(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setEditOpen(false);
    router.refresh();
  }

  async function onDeleteTable(table: FloorTable) {
    const result = await deleteTableAction(table.id);
    if (!result.ok) return errToast(result.error);
    toast.success(result.data?.deactivated ? t("deactivatedInstead") : tc("success"));
    router.refresh();
  }

  async function onSetStatus(table: FloorTable, status: "available" | "reserved" | "cleaning") {
    const result = await setTableStatusAction(table.id, status);
    if (!result.ok) return errToast(result.error);
    router.refresh();
  }

  async function onMove(targetTableId: string) {
    if (!moveOrder) return;
    const result = await moveOrderToTableAction(moveOrder.order.id, targetTableId);
    setMoveOrder(null);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    router.refresh();
  }

  async function onMerge(targetOrderId: string) {
    if (!mergeSource) return;
    const result = await mergeOrdersAction(mergeSource.order.id, targetOrderId);
    setMergeSource(null);
    if (!result.ok) return errToast(result.error);
    toast.success(t("mergeSuccess"));
    router.refresh();
  }

  async function onRequestBill(order: FloorOrder) {
    const result = await requestBillAction(order.id);
    if (!result.ok) return errToast(result.error);
    router.refresh();
  }

  // group by zone
  const zones = new Map<string, FloorTable[]>();
  for (const table of tables) {
    const key = table.zone ?? t("noZone");
    const list = zones.get(key) ?? [];
    list.push(table);
    zones.set(key, list);
  }

  const mergeTargets =
    mergeSource !== null
      ? tables.flatMap((tb) => tb.orders.filter((o) => o.id !== mergeSource.order.id).map((o) => ({ order: o, table: tb })))
      : [];

  return (
    <div>
      {permissions.editFloor && (
        <div className="mb-4">
          <Button onClick={openCreate}>
            <Plus />
            {t("newTable")}
          </Button>
        </div>
      )}

      {[...zones.entries()].map(([zoneName, zoneTables]) => (
        <section key={zoneName} className="mb-6">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">{zoneName}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {zoneTables.map((table) => {
              const order = table.orders[0] ?? null;
              const extraOrders = table.orders.length - 1;
              return (
                <div
                  key={table.id}
                  className={cn(
                    "relative flex min-h-32 flex-col rounded-xl border-2 p-3 transition-shadow hover:shadow-md",
                    TABLE_STATUS_COLOR[table.status] ?? "border-border"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-bold leading-tight">{table.name}</div>
                      <div className="flex items-center gap-1 text-xs opacity-80">
                        <Users className="h-3 w-3" />
                        {order?.guestCount ?? table.seats}
                        <span className="mx-1">·</span>
                        {t(`status.${table.status}`)}
                      </div>
                    </div>
                    {(permissions.manage || permissions.editFloor) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="iconSm" className="text-current">
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {permissions.pos && !order && table.status !== "cleaning" && (
                            <DropdownMenuItem asChild>
                              <Link href={`/pos?table=${table.id}`}>
                                <Plus />
                                {t("openTable")}
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {permissions.manage && order && (
                            <>
                              {permissions.pos && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/pos?table=${table.id}`}>
                                    <Plus />
                                    {t("addOrder")}
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => setMoveOrder({ order, fromTable: table })}>
                                <ArrowRightLeft />
                                {t("moveOrder")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setMergeSource({ order, table })}>
                                <Merge />
                                {t("mergeInto")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onRequestBill(order)}>
                                <Clock />
                                {t("requestBill")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {permissions.manage && !order && (
                            <>
                              {table.status !== "reserved" && (
                                <DropdownMenuItem onSelect={() => onSetStatus(table, "reserved")}>
                                  <CalendarClock />
                                  {t("reserve")}
                                </DropdownMenuItem>
                              )}
                              {table.status !== "cleaning" && (
                                <DropdownMenuItem onSelect={() => onSetStatus(table, "cleaning")}>
                                  <BrushCleaning />
                                  {t("markCleaning")}
                                </DropdownMenuItem>
                              )}
                              {table.status !== "available" && (
                                <DropdownMenuItem onSelect={() => onSetStatus(table, "available")}>
                                  <CheckCircle2 />
                                  {t("markAvailable")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {permissions.editFloor && (
                            <>
                              <DropdownMenuItem onSelect={() => openEdit(table)}>
                                <Pencil />
                                {tc("edit")}
                              </DropdownMenuItem>
                              {!order && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => onDeleteTable(table)}
                                >
                                  <Trash2 />
                                  {tc("delete")}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {order ? (
                    <button
                      type="button"
                      onClick={() => openOrder(order.id)}
                      className="mt-auto rounded-lg bg-background/70 p-2 text-start backdrop-blur transition-colors hover:bg-background"
                    >
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>#{order.number}</span>
                        <span className="tabular">{formatMoney(order.total, locale)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t("itemsShort", { count: order.itemCount })}
                          {order.waiterName ? ` · ${order.waiterName}` : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t("minutes", { count: minutesSince(new Date(order.createdAt)) })}
                        </span>
                      </div>
                      {extraOrders > 0 && (
                        <Badge variant="secondary" className="mt-1">
                          +{extraOrders}
                        </Badge>
                      )}
                    </button>
                  ) : (
                    permissions.pos &&
                    table.status !== "cleaning" && (
                      <Link
                        href={`/pos?table=${table.id}`}
                        className="mt-auto rounded-lg border border-dashed border-current/40 p-2 text-center text-xs font-medium opacity-70 transition-opacity hover:opacity-100"
                      >
                        + {t("openTable")}
                      </Link>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Table CRUD dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTable") : t("newTable")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tb-name">{t("fields.name")}</Label>
              <Input id="tb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="T-09" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tb-seats">{t("fields.seats")}</Label>
                <Input id="tb-seats" type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tb-zone">{t("fields.zone")}</Label>
                <Input id="tb-zone" value={zone} onChange={(e) => setZone(e.target.value)} maxLength={40} placeholder={t("zonePlaceholder")} />
              </div>
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="tb-active">{t("fields.active")}</Label>
                <Switch id="tb-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onSaveTable} loading={saving} disabled={!name.trim()}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move order */}
      <Dialog open={Boolean(moveOrder)} onOpenChange={(open) => !open && setMoveOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("moveOrderTitle", { number: moveOrder?.order.number ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto scrollbar-thin">
            {tables
              .filter((tb) => tb.id !== moveOrder?.fromTable.id && tb.status !== "cleaning")
              .map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => onMove(tb.id)}
                  className={cn(
                    "rounded-lg border-2 p-3 text-sm font-semibold transition-transform active:scale-95",
                    TABLE_STATUS_COLOR[tb.status] ?? "border-border"
                  )}
                >
                  {tb.name}
                  <div className="text-[10px] font-normal opacity-80">{t(`status.${tb.status}`)}</div>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge order */}
      <Dialog open={Boolean(mergeSource)} onOpenChange={(open) => !open && setMergeSource(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mergeTitle", { number: mergeSource?.order.number ?? "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("mergeHint")}</p>
          <div className="max-h-72 divide-y overflow-y-auto rounded-lg border scrollbar-thin">
            {mergeTargets.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">{tc("noData")}</div>
            )}
            {mergeTargets.map(({ order, table }) => (
              <button
                key={order.id}
                type="button"
                onClick={() => onMerge(order.id)}
                className="flex w-full items-center justify-between p-3 text-sm hover:bg-accent"
              >
                <span className="font-medium">
                  #{order.number} · {table.name}
                </span>
                <span className="tabular">{formatMoney(order.total, locale)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <OrderDetailSheet detail={detail} methods={methods} locale={locale} permissions={permissions} onClose={closeOrder} />
    </div>
  );
}
