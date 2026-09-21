/** A random, checksum-valid Chilean RUT for e2e fixtures — registration (and now login) require
 * a real one, and it must be globally unique across the whole DB. Collisions are astronomically
 * unlikely across the ~24M possible bodies, same tolerance `randomUUID()`-based emails already
 * have. Mirrors the checksum algorithm in `packages/contracts/src/auth/rut.ts`. */
export function randomValidRut(): string {
  const body = String(Math.floor(1_000_000 + Math.random() * 24_000_000));
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return `${body}-${checkDigit}`;
}
