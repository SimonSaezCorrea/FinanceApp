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
