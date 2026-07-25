"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgePercent,
  Banknote,
  CheckCircle2,
  ImageOff,
  Minus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  StickyNote,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";

import { createOrderAction, type CreatedOrderSummary } from "@/lib/actions/orders";
import type { CreateOrderInput } from "@/lib/validation/orders";
import type { PosData, PosProduct } from "@/lib/pos-queries";
import { computeOrderTotals, type DiscountInput } from "@/lib/order-math";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import type { Locale } from "@/lib/locale";
import type { OrderType } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  cartConfigKey,
  cartLineTotal,
  cartLineUnitPrice,
  type CartLine,
} from "@/components/pos/cart-types";
import { ItemConfigDialog } from "@/components/pos/item-config-dialog";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { DiscountDialog, type DiscountDraft } from "@/components/pos/discount-dialog";
import { TABLE_STATUS_COLOR } from "@/lib/order-status";

interface PosScreenProps {
  data: PosData;
  branchId: string;
  branchName: string;
  userName: string;
  canDiscount: boolean;
  canPay: boolean;
  initialTableId: string | null;
}

export function PosScreen({ data, branchId, branchName, userName, canDiscount, canPay, initialTableId }: PosScreenProps) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const locale = useLocale() as Locale;

  // ---- Catalog state ---------------------------------------------------------
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  // ---- Cart state --------------------------------------------------------------
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [orderType, setOrderType] = React.useState<OrderType>(
    initialTableId ? "dine_in" : data.settings.defaultOrderType
  );
  const [tableId, setTableId] = React.useState<string | null>(initialTableId);
  const [guestCount, setGuestCount] = React.useState("2");
  const [waiterId, setWaiterId] = React.useState<string | null>(null);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [deliveryAddress, setDeliveryAddress] = React.useState("");
  const [deliveryZoneId, setDeliveryZoneId] = React.useState<string | null>(null);
  const [driverId, setDriverId] = React.useState<string | null>(null);
  const [orderNotes, setOrderNotes] = React.useState("");
  const [discount, setDiscount] = React.useState<DiscountDraft | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = React.useState(false);

  // ---- Dialogs -----------------------------------------------------------------
  const [configProduct, setConfigProduct] = React.useState<PosProduct | null>(null);
  const [editingLine, setEditingLine] = React.useState<CartLine | null>(null);
  const [tablePickerOpen, setTablePickerOpen] = React.useState(false);
  const [deliveryOpen, setDeliveryOpen] = React.useState(false);
  const [discountOpen, setDiscountOpen] = React.useState(false);
  const [mobileCartOpen, setMobileCartOpen] = React.useState(false);
  const [createdOrder, setCreatedOrder] = React.useState<CreatedOrderSummary | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);

  // ---- Derived ---------------------------------------------------------------
  const filteredProducts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.products.filter(
      (p) =>
        (!categoryId || p.categoryId === categoryId) &&
        (!q || p.name.toLowerCase().includes(q))
    );
  }, [data.products, categoryId, search]);

  const discountInput: DiscountInput | null = React.useMemo(() => {
    if (!discount) return null;
    if (discount.kind === "percent") return { kind: "percent", value: Math.round(discount.percentValue * 100) };
    const fixed = parseMoneyInput(discount.fixedValue || "0") ?? 0;
    return { kind: "fixed", value: fixed };
  }, [discount]);

  const deliveryFee = orderType === "delivery" ? data.zones.find((z) => z.id === deliveryZoneId)?.fee ?? 0 : 0;

  const totals = React.useMemo(
    () =>
      computeOrderTotals({
        lines: lines.map((l) => ({
          unitPrice: l.baseUnitPrice,
          qty: l.qty,
          taxRateBp: l.taxRate,
          modifiersDelta: l.modifiers.reduce((s, m) => s + m.priceDelta, 0),
        })),
        discount: discountInput,
        deliveryFee,
        taxMode: data.settings.taxMode,
      }),
    [lines, discountInput, deliveryFee, data.settings.taxMode]
  );

  const selectedTable = data.tables.find((tb) => tb.id === tableId) ?? null;
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  // ---- Cart mutations ----------------------------------------------------------
  function addLine(line: Omit<CartLine, "uid">) {
    setLines((prev) => {
      const key = cartConfigKey(line);
      const existing = prev.find((l) => cartConfigKey(l) === key);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + line.qty } : l));
      }
      return [...prev, { ...line, uid: crypto.randomUUID() }];
    });
  }

  function updateLine(uid: string, next: Omit<CartLine, "uid">) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...next, uid } : l)));
  }

  function bumpQty(uid: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.uid === uid ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function onProductClick(product: PosProduct) {
    if (!product.isAvailable) return;
    const needsConfig =
      product.type === "combo" || product.variants.length > 0 || product.modifierGroups.length > 0;
    if (!needsConfig) {
      addLine({
        productId: product.id,
        name: product.name,
        variantId: null,
        variantName: null,
        baseUnitPrice: product.sellPrice,
        taxRate: product.taxRate,
        modifiers: [],
        comboSelections: [],
        qty: 1,
        notes: "",
      });
      return;
    }
    setEditingLine(null);
    setConfigProduct(product);
  }

  function onEditLine(line: CartLine) {
    const product = data.products.find((p) => p.id === line.productId);
    if (!product) return;
    setEditingLine(line);
    setConfigProduct(product);
  }

  function resetCart() {
    setLines([]);
    setDiscount(null);
    setOrderNotes("");
    setCreatedOrder(null);
    setIdempotencyKey(crypto.randomUUID());
    if (orderType === "dine_in") setTableId(null);
  }

  // ---- Submit ------------------------------------------------------------------
  const canConfirm =
    lines.length > 0 &&
    !submitting &&
    (orderType !== "dine_in" || Boolean(tableId)) &&
    (orderType !== "delivery" || (customerPhone.trim() && deliveryAddress.trim()));

  async function onConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);

    const payload: CreateOrderInput = {
      idempotencyKey,
      type: orderType,
      tableId: orderType === "dine_in" ? tableId : null,
      guestCount: orderType === "dine_in" ? Number(guestCount) || 1 : null,
      waiterId: waiterId ?? null,
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() : null,
      deliveryZoneId: orderType === "delivery" ? deliveryZoneId : null,
      driverId: orderType === "delivery" ? driverId : null,
      notes: orderNotes.trim() || null,
      discount: discount
        ? discount.kind === "percent"
          ? { kind: "percent", percentValue: discount.percentValue, reason: discount.reason || null }
          : { kind: "fixed", fixedValue: discount.fixedValue, reason: discount.reason || null }
        : null,
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        qty: l.qty,
        notes: l.notes.trim() || null,
        modifierIds: l.modifiers.map((m) => m.id),
        comboSelections: l.comboSelections.map((s) => ({ comboGroupId: s.comboGroupId, productId: s.productId })),
      })),
    };

    const result = await createOrderAction(branchId, payload);
    setSubmitting(false);

    if (result.ok && result.data) {
      setCreatedOrder(result.data);
      setMobileCartOpen(false);
    } else if (!result.ok) {
      toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : te("generic"));
      if (result.error === "generic") setIdempotencyKey(crypto.randomUUID());
    }
  }

  // ---- Sub-views -----------------------------------------------------------------

  const orderTypeBar = (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {(["dine_in", "takeaway", "delivery"] as OrderType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => {
            setOrderType(type);
            if (type === "dine_in" && !tableId) setTablePickerOpen(true);
            if (type === "delivery" && !customerPhone) setDeliveryOpen(true);
          }}
          className={cn(
            "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
            orderType === type ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(`types.${type}`)}
        </button>
      ))}
    </div>
  );

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        {orderTypeBar}
        {orderType === "dine_in" && (
          <button
            type="button"
            onClick={() => setTablePickerOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="font-medium">
              {selectedTable ? t("tableLabel", { name: selectedTable.name }) : t("chooseTable")}
            </span>
            <span className="text-xs text-muted-foreground">
              {selectedTable ? t("guests", { count: Number(guestCount) || 1 }) : "—"}
            </span>
          </button>
        )}
        {orderType === "delivery" && (
          <button
            type="button"
            onClick={() => setDeliveryOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="min-w-0 truncate font-medium">
              {customerPhone ? `${customerName || t("customer")} · ${customerPhone}` : t("deliveryDetails")}
            </span>
            <span className="ms-2 shrink-0 text-xs text-muted-foreground">
              {deliveryFee > 0 ? formatMoney(deliveryFee, locale) : "—"}
            </span>
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y">
          {lines.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <ShoppingCart className="h-8 w-8 opacity-30" />
              {t("cartEmpty")}
            </div>
          )}
          {lines.map((line) => (
            <div key={line.uid} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onEditLine(line)}
                  className="min-w-0 flex-1 text-start"
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{line.name}</span>
                    {line.variantName && <Badge variant="secondary">{line.variantName}</Badge>}
                    <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  </div>
                  {(line.modifiers.length > 0 || line.comboSelections.length > 0) && (
                    <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                      {line.comboSelections.map((s) => (
                        <div key={`${s.comboGroupId}-${s.productId}`}>
                          {s.groupName}: {s.name}
                          {s.priceDelta !== 0 && ` (${formatMoney(s.priceDelta, locale, { signed: true })})`}
                        </div>
                      ))}
                      {line.modifiers.map((m) => (
                        <div key={m.id}>
                          + {m.name}
                          {m.priceDelta !== 0 && ` (${formatMoney(m.priceDelta, locale, { signed: true })})`}
                        </div>
                      ))}
                    </div>
                  )}
                  {line.notes && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-warning-foreground">
                      <StickyNote className="h-3 w-3" />
                      {line.notes}
                    </div>
                  )}
                </button>
                <div className="text-end text-sm font-semibold tabular">
                  {formatMoney(cartLineTotal(line), locale)}
                  <div className="text-xs font-normal text-muted-foreground tabular">
                    {line.qty} × {formatMoney(cartLineUnitPrice(line), locale)}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button variant="outline" size="iconSm" onClick={() => bumpQty(line.uid, -1)}>
                  <Minus />
                </Button>
                <span className="w-8 text-center text-sm font-medium tabular">{line.qty}</span>
                <Button variant="outline" size="iconSm" onClick={() => bumpQty(line.uid, 1)}>
                  <Plus />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="ms-auto text-destructive hover:text-destructive"
                  onClick={() => setLines((prev) => prev.filter((l) => l.uid !== line.uid))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t p-3">
        <div className="flex gap-2">
          {canDiscount && (
            <Button
              variant={discount ? "secondary" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setDiscountOpen(true)}
              disabled={lines.length === 0}
            >
              <BadgePercent />
              {discount ? t("discountApplied") : t("discount")}
            </Button>
          )}
          <NotesButton value={orderNotes} onChange={setOrderNotes} />
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t("subtotal")}</span>
            <span className="tabular">{formatMoney(totals.subtotal, locale)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t("discount")}</span>
              <span className="tabular">-{formatMoney(totals.discountAmount, locale)}</span>
            </div>
          )}
          {totals.deliveryFee > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t("deliveryFee")}</span>
              <span className="tabular">{formatMoney(totals.deliveryFee, locale)}</span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground/80">
              <span>{t("taxIncluded")}</span>
              <span className="tabular">{formatMoney(totals.taxAmount, locale)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 text-lg font-semibold">
            <span>{t("total")}</span>
            <span className="tabular">{formatMoney(totals.total, locale)}</span>
          </div>
        </div>

        <Button size="xl" className="w-full" disabled={!canConfirm} loading={submitting} onClick={onConfirm}>
          <CheckCircle2 />
          {t("confirmOrder")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* POS topbar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Button variant="ghost" size="iconSm" asChild>
          <Link href="/" aria-label={tc("back")}>
            <ArrowLeft className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          {t("title")}
        </div>
        <Badge variant="secondary">{branchName}</Badge>
        <div className="ms-auto text-xs text-muted-foreground">{userName}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Catalog */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-10 ps-9"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
                {tc("all")}
              </CategoryChip>
              {data.categories.map((c) => (
                <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                  {c.name}
                </CategoryChip>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={!product.isAvailable}
                  onClick={() => onProductClick(product)}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-start shadow-sm transition-all",
                    product.isAvailable
                      ? "hover:border-primary/50 hover:shadow-md active:scale-[0.98]"
                      : "opacity-45"
                  )}
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-24 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-muted text-muted-foreground">
                      <ImageOff className="h-6 w-6 opacity-40" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-2.5">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</span>
                    <div className="mt-auto flex items-center justify-between pt-1.5">
                      <span className="text-sm font-semibold text-primary tabular">
                        {formatMoney(product.sellPrice, locale)}
                      </span>
                      {product.type === "combo" && <Badge variant="info">{t("comboBadge")}</Badge>}
                      {!product.isAvailable && <Badge variant="secondary">{t("unavailable")}</Badge>}
                    </div>
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center text-sm text-muted-foreground">{tc("noData")}</div>
              )}
            </div>
          </ScrollArea>
        </main>

        {/* Cart — desktop */}
        <aside className="hidden w-[380px] shrink-0 border-s lg:block">{cartPanel}</aside>
      </div>

      {/* Cart — mobile bottom bar */}
      <div className="border-t p-2 lg:hidden">
        <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <SheetTrigger asChild>
            <Button size="xl" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <ShoppingCart />
                {t("viewCart", { count: itemCount })}
              </span>
              <span className="tabular">{formatMoney(totals.total, locale)}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85dvh] p-0">
            <SheetTitle className="sr-only">{t("cart")}</SheetTitle>
            {cartPanel}
          </SheetContent>
        </Sheet>
      </div>

      {/* Item configuration */}
      {configProduct && (
        <ItemConfigDialog
          product={configProduct}
          existing={editingLine}
          locale={locale}
          onClose={() => {
            setConfigProduct(null);
            setEditingLine(null);
          }}
          onSubmit={(line) => {
            if (editingLine) updateLine(editingLine.uid, line);
            else addLine(line);
            setConfigProduct(null);
            setEditingLine(null);
          }}
        />
      )}

      {/* Table picker */}
      <Dialog open={tablePickerOpen} onOpenChange={setTablePickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("chooseTable")}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[55dvh] grid-cols-3 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-4">
            {data.tables.map((table) => (
              <button
                key={table.id}
                type="button"
                disabled={table.status === "cleaning"}
                onClick={() => {
                  setTableId(table.id);
                  setTablePickerOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-40",
                  TABLE_STATUS_COLOR[table.status] ?? "border-border",
                  tableId === table.id && "ring-2 ring-ring ring-offset-2"
                )}
              >
                <span>{table.name}</span>
                <span className="text-xs font-normal opacity-80">
                  {t("seats", { count: table.seats })}
                  {table.zone ? ` · ${table.zone}` : ""}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-90">
                  {t(`tableStatus.${table.status}`)}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pos-guests">{t("guestCount")}</Label>
              <Input
                id="pos-guests"
                type="number"
                min={1}
                max={50}
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("waiter")}</Label>
              <Select value={waiterId ?? "__me__"} onValueChange={(v) => setWaiterId(v === "__me__" ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me__">{t("me")}</SelectItem>
                  {data.staff
                    .filter((s) => ["waiter", "cashier", "manager"].includes(s.roleKey ?? ""))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery details */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deliveryDetails")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="d-phone">{t("customerPhone")} *</Label>
              <Input
                id="d-phone"
                inputMode="tel"
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="05 XX XX XX XX"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-name">{t("customerName")}</Label>
              <Input id="d-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-address">{t("address")} *</Label>
              <Textarea
                id="d-address"
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t("zone")}</Label>
                <Select value={deliveryZoneId ?? "__none__"} onValueChange={(v) => setDeliveryZoneId(v === "__none__" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{tc("none")}</SelectItem>
                    {data.zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name} · {formatMoney(z.fee, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("driver")}</Label>
                <Select value={driverId ?? "__none__"} onValueChange={(v) => setDriverId(v === "__none__" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{tc("none")}</SelectItem>
                    {data.staff
                      .filter((s) => s.roleKey === "delivery")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDeliveryOpen(false)} disabled={!customerPhone.trim() || !deliveryAddress.trim()}>
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount */}
      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        value={discount}
        onApply={setDiscount}
        subtotal={totals.subtotal}
        locale={locale}
      />

      {/* Success overlay */}
      <Dialog open={Boolean(createdOrder)} onOpenChange={(open) => !open && resetCart()}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader className="items-center sm:text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <DialogTitle className="text-2xl">#{createdOrder?.number}</DialogTitle>
          </DialogHeader>
          <div className="text-3xl font-bold tabular">{formatMoney(createdOrder?.total ?? 0, locale)}</div>
          <p className="text-sm text-muted-foreground">{t("orderCreated")}</p>
          <div className="grid gap-2">
            {canPay && (
              <Button size="xl" onClick={() => setPayOpen(true)}>
                <Banknote />
                {t("payNow")}
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={resetCart}>
              {t("newOrder")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment */}
      {createdOrder && (
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          orderId={createdOrder.id}
          orderNumber={createdOrder.number}
          total={createdOrder.total}
          paidAmount={0}
          methods={data.methods}
          locale={locale}
          onSettled={() => {
            setPayOpen(false);
            resetCart();
          }}
        />
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

function NotesButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  return (
    <>
      <Button
        variant={value ? "secondary" : "outline"}
        size="sm"
        className="flex-1"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <StickyNote />
        {t("orderNotes")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("orderNotes")}</DialogTitle>
          </DialogHeader>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={300} />
          <DialogFooter>
            <Button
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
