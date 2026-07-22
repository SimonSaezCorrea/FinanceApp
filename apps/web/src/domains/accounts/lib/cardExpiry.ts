export function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

export function cleanExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/** Parses "MM/AA" into a 1-12 month + 2000-based year, or null if not a valid expiry. */
export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{1,2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
}
