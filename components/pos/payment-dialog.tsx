"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Banknote, CheckCircle2, CreditCard, Wallet } from "lucide-react";

import { addPaymentAction } from "@/lib/actions/payments";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { changeDue } from "@/lib/order-math";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Separator } from "@/components/ui/separator";

interface PaymentMethodOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  total: number;
  paidAmount: number;
  methods: PaymentMethodOption[];
  locale: Locale;
  /** called once the order is FULLY paid */
  onSettled?: () => void;
}

/**
 * Split-tender payment flow: take any number of partial payments until the
 * order is settled. Cash computes change; every attempt carries its own
 * idempotency key so a network retry can never double-charge.
 */
export function PaymentDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  total,
  paidAmount,
  methods,
  locale,
  onSettled,
}: PaymentDialogProps) {
  const t = useTranslations("payments");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [paid, setPaid] = React.useState(paidAmount);
  const [methodId, setMethodId] = React.useState(methods[0]?.id ?? "");
  const [amountStr, setAmountStr] = React.useState("");
  const [receivedStr, setReceivedStr] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [lastChange, setLastChange] = React.useState<number | null>(null);

  const remaining = Math.max(0, total - paid);
  const method = methods.find((m) => m.id === methodId) ?? null;
  const isCash = method?.type === "cash";

  // Reset when (re)opened
  React.useEffect(() => {
    if (open) {
      setPaid(paidAmount);
      setAmountStr(String(Math.max(0, total - paidAmount) / 100));
      setReceivedStr("");
      setLastChange(null);
      setIdempotencyKey(crypto.randomUUID());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amount = parseMoneyInput(amountStr || "0") ?? 0;
  const received = parseMoneyInput(receivedStr || "0") ?? 0;
  const effectiveReceived = isCash ? (receivedStr.trim() ? received : amount) : amount;
  const change = isCash ? changeDue(amount, effectiveReceived) : 0;

  const amountValid = amount > 0 && amount <= remaining;
  const receivedValid = !isCash || effectiveReceived >= amount;
  const canSubmit = amountValid && receivedValid && !submitting && Boolean(method);

  async function onSubmit() {
    if (!canSubmit || !method) return;
    setSubmitting(true);
    const result = await addPaymentAction({
      orderId,
      methodId: method.id,
      amount: amountStr,
      receivedAmount: isCash && receivedStr.trim() ? receivedStr : undefined,
      idempotencyKey,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : te("generic"));
      if (result.error === "generic") setIdempotencyKey(crypto.randomUUID());
      return;
    }

    const data = result.data!;
    setPaid(data.paidAmount);
    setLastChange(data.changeAmount > 0 ? data.changeAmount : null);
    setIdempotencyKey(crypto.randomUUID());
    router.refresh();

    if (data.remaining <= 0) {
      toast.success(t("fullyPaid", { number: orderNumber }));
      if (data.changeAmount > 0) {
        // leave the change on screen; the cashier closes when done
        setAmountStr("0");
        setReceivedStr("");
      } else {
        onSettled?.();
        onOpenChange(false);
      }
    } else {
      toast.success(t("partialTaken", { amount: formatMoney(data.appliedAmount, locale) }));
      setAmountStr(String(data.remaining / 100));
      setReceivedStr("");
    }
  }

  const quickAmounts = [50000, 100000, 200000]; // 500 / 1000 / 2000 DA

  function methodIcon(type: string) {
    if (type === "cash") return <Banknote className="h-4 w-4" />;
    if (type === "card") return <CreditCard className="h-4 w-4" />;
    return <Wallet className="h-4 w-4" />;
  }

  const settled = remaining <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("title")} · #{orderNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-muted/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{t("amountDue")}</span>
            <span className={cn("text-2xl font-bold tabular", settled ? "text-success" : "")}>
              {formatMoney(remaining, locale)}
            </span>
          </div>
          {paid > 0 && (
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{t("alreadyPaid")}</span>
              <span className="tabular">{formatMoney(paid, locale)} / {formatMoney(total, locale)}</span>
            </div>
          )}
        </div>

        {lastChange !== null && (
          <div className="flex items-center justify-between rounded-lg border-2 border-success/60 bg-success/10 p-3">
            <span className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-5 w-5" />
              {t("changeDue")}
            </span>
            <span className="text-2xl font-bold text-success tabular">{formatMoney(lastChange, locale)}</span>
          </div>
        )}

        {!settled && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethodId(m.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 text-xs font-medium transition-all active:scale-95",
                    methodId === m.id ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/40"
                  )}
                >
                  {methodIcon(m.type)}
                  {m.name}
                </button>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Label>{t("amountToPay")}</Label>
              <MoneyInput value={amountStr} onChange={setAmountStr} className="h-11 text-lg" />
              {!amountValid && amount > remaining && (
                <p className="text-xs text-destructive">{t("errors.amount_exceeds_due")}</p>
              )}
            </div>

            {isCash && (
              <div className="grid gap-1.5">
                <Label>{t("received")}</Label>
                <MoneyInput value={receivedStr} onChange={setReceivedStr} className="h-11 text-lg" placeholder={amountStr} />
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => setReceivedStr(String(amount / 100))}>
                    {t("exactAmount")}
                  </Button>
                  {quickAmounts.map((qa) => (
                    <Button key={qa} type="button" variant="outline" size="sm" onClick={() => setReceivedStr(String(qa / 100))}>
                      {formatMoney(qa, locale, { decimals: 0 })}
                    </Button>
                  ))}
                </div>
                <div className="flex justify-between rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t("changeDue")}</span>
                  <span className={cn("font-semibold tabular", !receivedValid && "text-destructive")}>
                    {receivedValid ? formatMoney(change, locale) : t("errors.received_too_low")}
                  </span>
                </div>
              </div>
            )}

            <Separator />
            <Button size="xl" className="w-full" disabled={!canSubmit} loading={submitting} onClick={onSubmit}>
              {t("takePayment")} · {formatMoney(amount, locale)}
            </Button>
          </>
        )}

        {settled && (
          <Button
            size="xl"
            className="w-full"
            onClick={() => {
              onSettled?.();
              onOpenChange(false);
            }}
          >
            {t("done")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
