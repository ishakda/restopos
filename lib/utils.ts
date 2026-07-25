import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Narrow an unknown error to a display message without leaking internals. */
export function errorMessage(e: unknown, fallback = "Unexpected error"): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}
