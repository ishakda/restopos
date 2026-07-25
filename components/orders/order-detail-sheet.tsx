"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, Banknote, ChefHat, ChevronRight, HandCoins, Printer, ReceiptText, Scissors, StickyNote } from "lucide-react";

import { cancelOrderAction, splitOrderAction, updateOrderStatusAction } from "@/lib/actions/orders";
import { refundOrderAction } from "@/lib/actions/payments";
import { formatMoney } from "@/lib/money";
import { remainingDue } from "@/lib/order-math";
import type { Locale } from "@/lib/locale";
import type { OrderStatus, OrderType } from "@/lib/constants";
import { ORDER_STATUS_BADGE, PAYMENT_STATUS_BADGE, isOpenStatus, nextPrimaryStatus } from "@/lib/order-status";
import type { OrderDetailData } from "@/lib/order-detail";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PaymentDialog } from "@/components/pos/payment-dialog";

export interface OrderSheetPermissions {
  update: boolean;
  cancel: boolean;
  refund: boolean;
  pay: boolean;
  tables: boolean;
}

interface PaymentMethodOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function OrderDetailSheet({
  detail,
  methods,
  locale,
  permissions,
  onClose,
}: {
  detail: OrderDetailData | null;
  methods: PaymentMethodOption[];
  locale: Locale;
  permissions: OrderSheetPermissions;
  onClose: () => void;
}) {
  const t = useTranslations("orders");
  const tp = useTranslations("pos");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [pending, setPending] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundAmount, setRefundAmount] = React.useState("");
  const [refundReason, setRefundReason] = React.useState("");
  const [splitOpen, setSplitOpen] = React.useState(false);
  const [splitSelection, setSplitSelection] = React.useState<Set<string>>(new Set());

  if (!detail) {
    return (
      <Sheet open={false}>
        <SheetContent side="right" />
      </Sheet>
    );
  }

  const status = detail.status as OrderStatus;
  const open = isOpenStatus(status);
  const remaining = remainingDue(detail.total, detail.paidAmount);
  const nextStatus = nextPrimaryStatus(status, detail.type as OrderType);
  const refundable = detail.paidAmount - detail.refundedAmount;

  function errToast(code: string) {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : te.has(code) ? te(code) : te("generic"));
  }

  async function advance(next: OrderStatus) {
    setPending(true);
    const result = await updateOrderStatusAction(detail!.id, next);
    setPending(false);
    if (!result.ok) return errToast(result.error);
    router.refresh();
  }

  async function onCancel() {
    setPending(true);
    const result = await cancelOrderAction({ orderId: detail!.id, reason: cancelReason });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    setCancelOpen(false);
    toast.success(tc("success"));
    router.refresh();
  }

  async function onRefund() {
    setPending(true);
    const result = await refundOrderAction({ orderId: detail!.id, amount: refundAmount, reason: refundReason });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    setRefundOpen(false);
    toast.success(tc("success"));
    router.refresh();
  }

  async function onSplit() {
    setPending(true);
    const result = await splitOrderAction(detail!.id, [...splitSelection]);
    setPending(false);
    if (!result.ok) return errToast(result.error);
    setSplitOpen(false);
    setSplitSelection(new Set());
    toast.success(t("splitSuccess", { number: result.data?.newNumber ?? "" }));
    router.refresh();
  }

  const timeFmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-DZ" : "fr-FR", { hour: "2-digit", minute: "2-digit" })
      : "—";

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex flex-wrap items-center gap-2 pe-8">
              <ReceiptText className="h-5 w-5 text-primary" />
              #{detail.number}
              <Badge variant={ORDER_STATUS_BADGE[status] ?? "secondary"}>{t(`status.${detail.status}`)}</Badge>
              <Badge variant={PAYMENT_STATUS_BADGE[detail.paymentStatus] ?? "secondary"}>
                {t(`paymentStatus.${detail.paymentStatus}`)}
              </Badge>
            </SheetTitle>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{tp(`types.${detail.type}`)}</span>
              {detail.tableName && <span>{t("tableShort")} {detail.tableName}{detail.guestCount ? ` · ${tp("guests", { count: detail.guestCount })}` : ""}</span>}
              {detail.customerPhone && <span dir="ltr">{detail.customerPhone}</span>}
              {detail.waiterName && <span>{t("waiter")}: {detail.waiterName}</span>}
              <span>{timeFmt(detail.createdAt)}</span>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              {/* Items */}
              <div className="divide-y rounded-lg border">
                {detail.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        <span className="tabular">{item.qty} ×</span> {item.nameSnapshot}
                        {item.variantNameSnapshot && (
                          <Badge variant="secondary" className="ms-1.5">{item.variantNameSnapshot}</Badge>
                        )}
                      </div>
                      {(item.children.length > 0 || item.modifiers.length > 0) && (
                        <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                          {item.children.map((c) => (
                            <div key={c.id}>• {c.nameSnapshot}</div>
                          ))}
                          {item.modifiers.map((m) => (
                            <div key={m.id}>
                              + {m.nameSnapshot}
                              {m.priceDelta !== 0 && ` (${formatMoney(m.priceDelta, locale, { signed: true })})`}
                            </div>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-warning-foreground">
                          <StickyNote className="h-3 w-3" /> {item.notes}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular">{formatMoney(item.lineTotal, locale)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                <Row label={tp("subtotal")} value={formatMoney(detail.subtotal, locale)} muted />
                {detail.discountAmount > 0 && (
                  <Row
                    label={`${tp("discount")}${detail.discountReason ? ` (${detail.discountReason})` : ""}`}
                    value={`-${formatMoney(detail.discountAmount, locale)}`}
                    muted
                  />
                )}
                {detail.deliveryFee > 0 && <Row label={tp("deliveryFee")} value={formatMoney(detail.deliveryFee, locale)} muted />}
                {detail.taxAmount > 0 && <Row label={tp("taxIncluded")} value={formatMoney(detail.taxAmount, locale)} muted small />}
                <Separator className="my-1.5" />
                <Row label={tp("total")} value={formatMoney(detail.total, locale)} bold />
                {detail.paidAmount > 0 && <Row label={t("paid")} value={formatMoney(detail.paidAmount, locale)} muted />}
                {detail.refundedAmount > 0 && (
                  <Row label={t("refunded")} value={`-${formatMoney(detail.refundedAmount, locale)}`} muted />
                )}
                {remaining > 0 && <Row label={t("remaining")} value={formatMoney(remaining, locale)} boldPrimary />}
              </div>

              {/* Payments */}
              {detail.payments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">{t("payments")}</h4>
                  <div className="divide-y rounded-lg border text-sm">
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 p-2.5">
                        <div className="min-w-0">
                          <div className="font-medium">{p.methodName}</div>
                          <div className="text-xs text-muted-foreground">
                            {timeFmt(p.createdAt)} · {p.takenByName}
                            {p.changeAmount ? ` · ${t("changeGiven", { amount: formatMoney(p.changeAmount, locale) })}` : ""}
                          </div>
                        </div>
                        <span className="shrink-0 font-medium tabular">{formatMoney(p.amount, locale)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refunds */}
              {detail.refunds.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">{t("refunds")}</h4>
                  <div className="divide-y rounded-lg border text-sm">
                    {detail.refunds.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 p-2.5">
                        <div className="min-w-0">
                          <div className="font-medium">{r.reason}</div>
                          <div className="text-xs text-muted-foreground">{timeFmt(r.createdAt)} · {r.processedByName}</div>
                        </div>
                        <span className="shrink-0 font-medium text-destructive tabular">-{formatMoney(r.amount, locale)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.notes && (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
                  <StickyNote className="mb-1 h-4 w-4" />
                  {detail.notes}
                </div>
              )}

              {detail.cancelReason && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <span className="font-medium">{t("cancelledReason")}: </span>
                  {detail.cancelReason}
                  {detail.cancelledByName ? ` — ${detail.cancelledByName}` : ""}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Actions */}
          <div className="grid gap-2 border-t p-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <a href={`/print/receipt/${detail.id}`} target="_blank" rel="noopener noreferrer">
                  <Printer />
                  {t("printReceipt")}
                </a>
              </Button>
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <a href={`/print/kitchen/${detail.id}`} target="_blank" rel="noopener noreferrer">
                  <ChefHat />
                  {t("printKitchen")}
                </a>
              </Button>
            </div>
            {open && remaining > 0 && permissions.pay && (
              <Button size="lg" onClick={() => setPayOpen(true)}>
                <Banknote />
                {t("pay")} · {formatMoney(remaining, locale)}
              </Button>
            )}
            {open && nextStatus && permissions.update && (
              <Button
                size="lg"
                variant={remaining > 0 && permissions.pay ? "secondary" : "default"}
                disabled={pending || (nextStatus === "completed" && remaining > 0)}
                onClick={() => advance(nextStatus)}
              >
                <ChevronRight className="rtl:rotate-180" />
                {t(`advanceTo.${nextStatus}`)}
                {nextStatus === "completed" && remaining > 0 ? ` (${t("errors.unpaid_balance")})` : ""}
              </Button>
            )}
            <div className="flex gap-2">
              {open && permissions.tables && detail.items.length > 1 && detail.paidAmount === 0 && detail.discountAmount === 0 && (
                <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setSplitOpen(true)}>
                  <Scissors />
                  {t("splitBill")}
                </Button>
              )}
              {refundable > 0 && permissions.refund && (
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => {
                    setRefundAmount(String(refundable / 100));
                    setRefundOpen(true);
                  }}
                >
                  <HandCoins />
                  {t("refund")}
                </Button>
              )}
              {open && permissions.cancel && (
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:text-destructive"
                  disabled={pending || refundable > 0}
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban />
                  {tc("cancel")}
                </Button>
              )}
            </div>
            {open && permissions.cancel && refundable > 0 && (
              <p className="text-center text-xs text-muted-foreground">{t("errors.refund_first")}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Pay */}
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        orderId={detail.id}
        orderNumber={detail.number}
        total={detail.total}
        paidAmount={detail.paidAmount}
        methods={methods}
        locale={locale}
        onSettled={() => router.refresh()}
      />

      {/* Cancel */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cancelOrder", { number: detail.number })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>{t("cancelReasonLabel")}</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} maxLength={300} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {tc("back")}
            </Button>
            <Button variant="destructive" disabled={cancelReason.trim().length < 2} loading={pending} onClick={onCancel}>
              {t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("refundOrder", { number: detail.number })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("refundAmount", { max: formatMoney(refundable, locale) })}</Label>
              <MoneyInput value={refundAmount} onChange={setRefundAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("refundReason")}</Label>
              <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={2} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              {tc("back")}
            </Button>
            <Button variant="destructive" disabled={refundReason.trim().length < 2} loading={pending} onClick={onRefund}>
              {t("confirmRefund")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split */}
      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("splitBill")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("splitHint")}</p>
          <div className="max-h-64 divide-y overflow-y-auto rounded-lg border scrollbar-thin">
            {detail.items.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-3 p-2.5 text-sm">
                <Checkbox
                  checked={splitSelection.has(item.id)}
                  onCheckedChange={(v) =>
                    setSplitSelection((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">
                  {item.qty} × {item.nameSnapshot}
                </span>
                <span className="tabular">{formatMoney(item.lineTotal, locale)}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={splitSelection.size === 0 || splitSelection.size === detail.items.length}
              loading={pending}
              onClick={onSplit}
            >
              {t("confirmSplit", { count: splitSelection.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
  boldPrimary,
  small,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  boldPrimary?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${muted ? "text-muted-foreground" : ""} ${bold ? "text-base font-semibold" : ""} ${
        boldPrimary ? "font-semibold text-primary" : ""
      } ${small ? "text-xs" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
