/**
 * Calendar days for the indicator pages (spec 033): "today" is CHILE's day, the same one the
 * API records rates for — never the visitor's own time zone nor UTC.
 */

/** `YYYY-MM-DD` of `now` in America/Santiago. */
export function chileDay(now: Date = new Date()): string {
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The calendar day `days` before `day`, DST-proof (works on the day, not on an instant). */
export function daysBefore(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` shaped and a real date. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** A day written for people: "21 de octubre de 2026" / "October 21, 2026". */
export function formatDay(day: string, lang: string, month: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-CL" : "en-US", {
    timeZone: "UTC",
    day: "numeric",
    month,
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}
