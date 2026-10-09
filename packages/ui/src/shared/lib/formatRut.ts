/**
 * Live "as you type" formatter for a Chilean RUT input — `"123456785"` → `"12.345.678-5"`.
 * Purely cosmetic (never validates): the backend's own `isValidRut`/`normalizeRut` accept
 * either form, dots/dash or none, so this only exists to keep the input visually consistent
 * with how a RUT is normally written while the user types it.
 */
export function formatRutInput(raw: string): string {
  const clean = raw
    .replace(/[^0-9kK]/g, "")
    .toUpperCase()
    .slice(0, 9); // 8-digit body + check digit, the longest a real RUT ever is.
  if (clean.length <= 1) return clean;

  const body = clean.slice(0, -1);
  const checkDigit = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${checkDigit}`;
}
