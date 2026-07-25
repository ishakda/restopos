"use client";

import * as React from "react";
import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { parseMoneyInput } from "@/lib/money";

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
}

/**
 * Money field: free-text entry ("1 450,50"), validity feedback, DA/دج suffix.
 * The RAW STRING travels to the server action, which parses it with the same
 * strict parser — the client never sends a pre-computed number for money.
 */
export function MoneyInput({ value, onChange, allowNegative = false, className, ...props }: MoneyInputProps) {
  const locale = useLocale();
  const suffix = locale === "ar" ? "دج" : "DA";

  const parsed = value.trim() === "" ? 0 : parseMoneyInput(value);
  const invalid = parsed === null || (!allowNegative && parsed !== null && parsed < 0);

  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className={cn("pe-12 text-end tabular", invalid && "border-destructive focus-visible:ring-destructive", className)}
        {...props}
      />
      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}
