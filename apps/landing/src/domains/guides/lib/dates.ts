/** `YYYY-MM-DD` of a frontmatter date (Astro coerces `2026-10-23` to that day at UTC midnight). */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
