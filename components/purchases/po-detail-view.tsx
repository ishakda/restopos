"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Banknote, Check, PackageCheck, Send, X } from "lucide-react";

import { receivePurchaseOrderAction, setPurchaseOrderStatusAction } from "@/lib/actions/purchases";
import { paySupplierAction } from "@/lib/actions/suppliers";
import { formatMoney } from "@/lib/money";
import { UNIT_FACTORS, formatQty, fromBaseUnits } from "@/lib/units";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";
import type { Locale } from "@/lib/locale";
import { PO_STATUS_BADGE } from "@/components/purchases/po-status";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PoItem {
  id: string;
  ingredientName: string;
  baseUnit: string;
  displayUnit: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostMilli: number;
  lineTotal: number;
}

interface PoDetail {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  amountPaid: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  createdAt: string;
  orderedAt: string | null;
  receivedAt: string | null;
  createdByName: string;
  supplier: { id: string; name: string; phone: string | null };
  items: PoItem[];
  payments: { id: string; amount: number; method: string; userName: string; paidAt: string }[];
}

export function PoDetailView({
  po,
  locale,
  permissions,
}: {
  po: PoDetail;
  locale: Locale;
  permissions: { manage: boolean; receive: boolean; pay: boolean };
}) {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [receiveQty, setReceiveQty] = React.useState<Record<string, string>>({});
  const [payOpen, setPayOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState("cash");
  const [pending, setPending] = React.useState(false);

  const receivable = ["ordered", "partially_received"].includes(po.status);

  function errToast(code: string) {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : te.has(code) ? te(code) : te("generic"));
  }

  function openReceive() {
    const defaults: Record<string, string> = {};
    for (const item of po.items) {
      const remaining = item.qtyOrdered - item.qtyReceived;
      defaults[item.id] = remaining > 0 ? String(fromBaseUnits(remaining, item.displayUnit as DisplayUnit)) : "0";
    }
    setReceiveQty(defaults);
    setReceiveOpen(true);
  }

  async function onStatus(next: "ordered" | "cancelled") {
    setPending(true);
    const result = await setPurchaseOrderStatusAction(po.id, next);
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    router.refresh();
  }

  async function onReceive() {
    setPending(true);
    const result = await receivePurchaseOrderAction({
      poId: po.id,
      lines: po.items.map((item) => ({ itemId: item.id, qty: Number(receiveQty[item.id]) || 0 })),
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(t("receivedToast"));
    setReceiveOpen(false);
    router.refresh();
  }

  async function onPay() {
    setPending(true);
    const result = await paySupplierAction({
      supplierId: po.supplier.id,
      purchaseOrderId: po.id,
      amount: payAmount,
      method: payMethod,
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setPayOpen(false);
    router.refresh();
  }

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/purchases" aria-label={tc("back")}>
            <ArrowLeft className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {po.number}
            <Badge variant={PO_STATUS_BADGE[po.status] ?? "secondary"}>{t(`status.${po.status}`)}</Badge>
            <Badge variant={po.paymentStatus === "paid" ? "success" : po.paymentStatus === "partial" ? "warning" : "destructive"}>
              {t(`payment.${po.paymentStatus}`)}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {po.supplier.name}
            {po.supplier.phone ? <span dir="ltr"> · {po.supplier.phone}</span> : null} · {dateFmt.format(new Date(po.createdAt))} · {po.createdByName}
          </p>
        </div>
        <div className="flex gap-2">
          {permissions.manage && po.status === "draft" && (
            <>
              <Button onClick={() => onStatus("ordered")} loading={pending}>
                <Send />
                {t("markOrdered")}
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => onStatus("cancelled")} disabled={pending}>
                <X />
                {tc("cancel")}
              </Button>
            </>
          )}
          {permissions.receive && receivable && (
            <Button onClick={openReceive} loading={pending}>
              <PackageCheck />
              {t("receive")}
            </Button>
          )}
          {permissions.manage && po.status === "ordered" && (
            <Button variant="outline" className="text-destructive" onClick={() => onStatus("cancelled")} disabled={pending}>
              <X />
              {tc("cancel")}
            </Button>
          )}
          {permissions.pay && po.paymentStatus !== "paid" && po.status !== "cancelled" && po.status !== "draft" && (
            <Button
              variant="outline"
              onClick={() => {
                setPayAmount(String((po.total - po.amountPaid) / 100));
                setPayOpen(true);
              }}
            >
              <Banknote />
              {t("recordPayment")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("linesSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.ingredient")}</TableHead>
                <TableHead className="text-end">{t("ordered")}</TableHead>
                <TableHead className="text-end">{t("received")}</TableHead>
                <TableHead className="hidden text-end sm:table-cell">{t("unitCost")}</TableHead>
                <TableHead className="text-end">{t("total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((item) => {
                const remaining = item.qtyOrdered - item.qtyReceived;
                const unitCostCentimes = Math.round(
                  (item.unitCostMilli * UNIT_FACTORS[item.displayUnit as DisplayUnit].factor) / 1000
                );
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.ingredientName}</TableCell>
                    <TableCell className="text-end tabular">{formatQty(item.qtyOrdered, item.baseUnit as BaseUnit)}</TableCell>
                    <TableCell className="text-end tabular">
                      <span className={remaining === 0 ? "text-success" : item.qtyReceived > 0 ? "text-warning-foreground" : "text-muted-foreground"}>
                        {formatQty(item.qtyReceived, item.baseUnit as BaseUnit)}
                      </span>
                      {remaining === 0 && <Check className="ms-1 inline h-3.5 w-3.5 text-success" />}
                    </TableCell>
                    <TableCell className="hidden text-end text-muted-foreground tabular sm:table-cell">
                      {formatMoney(unitCostCentimes, locale)} / {item.displayUnit}
                    </TableCell>
                    <TableCell className="text-end font-medium tabular">{formatMoney(item.lineTotal, locale)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Separator className="my-3" />
          <div className="ms-auto max-w-64 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t("subtotal")}</span>
              <span className="tabular">{formatMoney(po.subtotal, locale)}</span>
            </div>
            {po.taxAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t("tax")}</span>
                <span className="tabular">{formatMoney(po.taxAmount, locale)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>{t("total")}</span>
              <span className="tabular">{formatMoney(po.total, locale)}</span>
            </div>
            {po.amountPaid > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t("paid")}</span>
                <span className="tabular">{formatMoney(po.amountPaid, locale)}</span>
              </div>
            )}
          </div>
          {po.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{po.notes}</p>}
        </CardContent>
      </Card>

      {po.payments.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("paymentsSection")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {po.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">
                  {dateFmt.format(new Date(p.paidAt))} · {p.method} · {p.userName}
                </span>
                <span className="font-medium tabular">{formatMoney(p.amount, locale)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Receive dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("receiveTitle", { number: po.number })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("receiveHint")}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin">
            {po.items.map((item) => {
              const remaining = item.qtyOrdered - item.qtyReceived;
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.ingredientName}</div>
                    <div className="text-xs text-muted-foreground tabular">
                      {t("remainingShort")}: {formatQty(remaining, item.baseUnit as BaseUnit)}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={receiveQty[item.id] ?? ""}
                    onChange={(e) => setReceiveQty({ ...receiveQty, [item.id]: e.target.value })}
                    className="w-24 text-end tabular"
                    disabled={remaining <= 0}
                  />
                  <span className="w-10 text-xs text-muted-foreground">{item.displayUnit}</span>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onReceive} loading={pending}>
              <PackageCheck />
              {t("confirmReceive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("recordPayment")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("payAmount")}</Label>
              <MoneyInput value={payAmount} onChange={setPayAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("payMethod")}</Label>
              <Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} maxLength={40} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onPay} loading={pending} disabled={!payAmount.trim()}>
              {t("recordPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
