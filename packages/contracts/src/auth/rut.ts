/**
 * Validates a Chilean RUT (national tax id) by its check digit (módulo 11).
 * Accepts with or without dots/dashes (e.g. "12.345.678-9" or "123456789").
 */
export function isValidRut(rut: string): boolean {
  const clean = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;

  const body = clean.slice(0, -1);
  const checkDigit = clean.slice(-1);

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const computed = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return computed === checkDigit;
}

/**
 * Canonical form of a RUT: digits + check digit only, no dots/dash, uppercase K — e.g.
 * "12.345.678-5" and "123456785" both become "123456785". Used wherever a RUT is a lookup key
 * (login, uniqueness) so two different but equivalent typings of the same RUT still match —
 * does NOT validate; call `isValidRut` first where that matters.
 */
export function normalizeRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase().trim();
}
