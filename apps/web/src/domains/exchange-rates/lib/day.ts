const pad = (n: number): string => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of `date` in the user's own time zone — the calendar day they are living in,
 * which is the one a payment or transfer form dates its movement with. */
export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The calendar day `days` before `day` (`YYYY-MM-DD` in, `YYYY-MM-DD` out), DST-proof. */
export function daysBefore(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The calendar day `days` after `day`. */
function daysAfter(day: string, days: number): string {
  return daysBefore(day, -days);
}

/**
 * `from`..`to` (both included) cut into consecutive windows of at most `maxDays` days, oldest
 * first. Empty when the range is inverted.
 */
export function splitRange(
  from: string,
  to: string,
  maxDays: number,
): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  for (let start = from; start <= to; start = daysAfter(start, maxDays)) {
    const end = daysAfter(start, maxDays - 1);
    windows.push({ from: start, to: end < to ? end : to });
  }
  return windows;
}
