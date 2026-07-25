"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { formatMoney, parseMoneyInput } from "@/lib/money";
import { computeDiscountAmount } from "@/lib/order-math";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";

export interface DiscountDraft {
  kind: "percent" | "fixed";
  percentValue: number;
  fixedValue: string;
  reason: string;
}

export function DiscountDialog({
  open,
  onOpenChange,
  value,
  onApply,
  subtotal,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DiscountDraft | null;
  onApply: (value: DiscountDraft | null) => void;
  subtotal: number;
  locale: Locale;
}) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");

  const [kind, setKind] = React.useState<"percent" | "fixed">(value?.kind ?? "percent");
  const [percent, setPercent] = React.useState(String(value?.percentValue ?? 10));
  const [fixed, setFixed] = React.useState(value?.fixedValue ?? "");
  const [reason, setReason] = React.useState(value?.reason ?? "");

  React.useEffect(() => {
    if (open) {
      setKind(value?.kind ?? "percent");
      setPercent(String(value?.percentValue ?? 10));
      setFixed(value?.fixedValue ?? "");
      setReason(value?.reason ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const percentNum = Math.min(100, Math.max(0, Number(percent) || 0));
  const fixedCentimes = parseMoneyInput(fixed || "0") ?? 0;
  const preview = computeDiscountAmount(
    subtotal,
    kind === "percent" ? { kind: "percent", value: Math.round(percentNum * 100) } : { kind: "fixed", value: fixedCentimes }
  );
  const valid = kind === "percent" ? percentNum > 0 : fixedCentimes > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("discountTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["percent", "fixed"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                kind === k ? "bg-background shadow" : "text-muted-foreground"
              )}
            >
              {t(`discountKind.${k}`)}
            </button>
          ))}
        </div>

        {kind === "percent" ? (
          <div className="grid gap-1.5">
            <Label>{t("discountPercent")}</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="pe-8 text-end tabular"
                dir="ltr"
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <div className="flex gap-1.5">
              {[5, 10, 20, 50].map((p) => (
                <Button key={p} type="button" variant="outline" size="sm" onClick={() => setPercent(String(p))}>
                  {p}%
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label>{t("discountAmount")}</Label>
            <MoneyInput value={fixed} onChange={setFixed} />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label>{t("discountReason")}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </div>

        <div className="flex justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("discountPreview")}</span>
          <span className="font-semibold tabular">-{formatMoney(preview, locale)}</span>
        </div>

        <DialogFooter className="gap-2">
          {value && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                onApply(null);
                onOpenChange(false);
              }}
            >
              {t("removeDiscount")}
            </Button>
          )}
          <Button
            disabled={!valid}
            onClick={() => {
              onApply({ kind, percentValue: percentNum, fixedValue: fixed, reason });
              onOpenChange(false);
            }}
          >
            {tc("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
