/**
 * Money — all amounts are integer CENTIMES of DZD (1 DA = 100 centimes).
 * Ingredient costs use MILLICENTIMES per base unit for precision; they are
 * rounded to centimes whenever they enter a financial figure.
 *
 * No floating-point arithmetic is ever used for money.
 */

import type { Locale } from "@/lib/locale";

export const CENTIMES_PER_DA = 100;
export const MILLI_PER_CENTIME = 1000;

const CURRENCY_SUFFIX: Record<Locale, string> = {
  fr: "DA",
  en: "DA",
  ar: "دج",
};

const NUMBER_LOCALE: Record<Locale, string> = {
  fr: "fr-DZ",
  en: "en-DZ",
  ar: "ar-DZ",
};

export function daToCentimes(da: number): number {
  return Math.round(da * CENTIMES_PER_DA);
}

export function centimesToDa(centimes: number): number {
  return centimes / CENTIMES_PER_DA;
}

/** Round millicentimes to whole centimes (half away from zero). */
export function milliToCentimes(milli: number): number {
  const sign = milli < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(milli) / MILLI_PER_CENTIME);
}

export interface FormatMoneyOptions {
  /** Force decimals: undefined = auto (hide ",00"), 0 or 2 to force. */
  decimals?: 0 | 2;
  /** Include the currency suffix (default true). */
  withCurrency?: boolean;
  /** Show explicit + for positive values. */
  signed?: boolean;
}

/**
 * Format centimes for display: fr "1 450 DA" / "1 450,50 DA", ar "١..."-free
 * (Latin digits are used for financial figures in all locales — standard for
 * Algerian receipts), suffix per locale.
 */
export function formatMoney(centimes: number, locale: Locale = "fr", opts: FormatMoneyOptions = {}): string {
  const { withCurrency = true, signed = false } = opts;
  const auto = opts.decimals === undefined;
  const decimals = auto ? (Math.abs(centimes) % CENTIMES_PER_DA === 0 ? 0 : 2) : opts.decimals!;

  const value = centimes / CENTIMES_PER_DA;
  const formatter = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem: "latn",
  });
  // Normalize exotic group separators (U+00A0, U+202F, U+066C) to a plain
  // space: deterministic output across JS engines & thermal printers.
  let out = formatter.format(value).replace(/[\u00A0\u202F\u066C]/g, " ");
  if (signed && centimes > 0) out = `+${out}`;
  if (withCurrency) out = `${out} ${CURRENCY_SUFFIX[locale]}`;
  return out;
}

/**
 * Parse a human money input ("1 450,50", "1450.5", "1,450.50") into centimes.
 * Returns null for invalid input. Accepts both comma and dot decimals.
 */
export function parseMoneyInput(input: string): number | null {
  // Strip regular / no-break / narrow spaces (used as thousands separators)
  const raw = input.trim().replace(/[\s\u00A0\u202F]/g, "");
  if (!raw) return null;

  const patterns: { re: RegExp; normalize: (m: string) => string }[] = [
    // 1450 / -1450
    { re: /^-?\d+$/, normalize: (m) => m },
    // 1450,50 / 1450.5 (plain decimal, 1-2 digits)
    { re: /^-?\d+[.,]\d{1,2}$/, normalize: (m) => m.replace(",", ".") },
    // 1.450 / 12.345.678 (EU thousands, same separator repeated)
    { re: /^-?\d{1,3}(\.\d{3})+$/, normalize: (m) => m.replace(/\./g, "") },
    // 1,450 / 12,345,678 (US thousands)
    { re: /^-?\d{1,3}(,\d{3})+$/, normalize: (m) => m.replace(/,/g, "") },
    // 1,450.50 (US style with decimals)
    { re: /^-?\d{1,3}(,\d{3})+\.\d{1,2}$/, normalize: (m) => m.replace(/,/g, "") },
    // 1.450,50 (EU style with decimals)
    { re: /^-?\d{1,3}(\.\d{3})+,\d{1,2}$/, normalize: (m) => m.replace(/\./g, "").replace(",", ".") },
  ];

  for (const { re, normalize } of patterns) {
    if (re.test(raw)) {
      const normalized = normalize(raw);
      const [intPart = "0", decPart = ""] = normalized.split(".");
      const negative = intPart.startsWith("-");
      const intVal = Math.abs(parseInt(intPart, 10));
      const decVal = decPart ? parseInt(decPart.padEnd(2, "0"), 10) : 0;
      if (Number.isNaN(intVal) || Number.isNaN(decVal)) return null;
      const total = intVal * CENTIMES_PER_DA + decVal;
      return negative ? -total : total;
    }
  }
  return null;
}

/** Basis points helpers (tax rates, percentages). 1900 = 19.00% */
export const BASIS_POINTS_DENOMINATOR = 10000;

export function formatBasisPoints(bp: number, locale: Locale = "fr"): string {
  const value = bp / 100;
  const formatter = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  });
  return `${formatter.format(value)}%`;
}

/** value * bp / 10000, rounded half away from zero — used for tax/discount math. */
export function applyBasisPoints(centimes: number, bp: number): number {
  const raw = (centimes * bp) / BASIS_POINTS_DENOMINATOR;
  const sign = raw < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(raw));
}
