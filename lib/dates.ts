/**
 * Branch-local business dates. Order numbering resets per local day in the
 * organization's timezone (default Africa/Algiers).
 */

export function dateKeyFor(timezone: string, at: Date = new Date()): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function minutesSince(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
}
