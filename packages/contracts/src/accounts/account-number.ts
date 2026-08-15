/**
 * How an account is identified varies by market, so the format is DATA about the
 * country, not a global rule:
 *  - Chile: free text. There is no single format, no check digit, and banks print
 *    it in whatever shape they like — validating it would only reject real numbers.
 *  - Argentina: a 22-digit CBU (bank account) or CVU (payment account at a PSP),
 *    both with two check digits, plus an `alias` (`mate.tango.mp`) that maps to it
 *    and is what people actually exchange.
 *
 * Only formats with a real, verifiable rule are validated — the same standard the
 * identifier types follow (RUT is check-digit validated, a passport is not).
 */

/** Account-number formats this app knows how to check, by ISO 3166-1 alpha-2. */
export const ACCOUNT_NUMBER_FORMATS = {
  AR: "CBU_CVU",
} as const satisfies Record<string, "CBU_CVU">;

export type AccountNumberFormat =
  (typeof ACCOUNT_NUMBER_FORMATS)[keyof typeof ACCOUNT_NUMBER_FORMATS];

/** The format a country uses, or `null` when it has none worth enforcing. */
export function accountNumberFormat(countryAlpha2?: string | null): AccountNumberFormat | null {
  if (!countryAlpha2) return null;
  return (
    ACCOUNT_NUMBER_FORMATS[countryAlpha2.toUpperCase() as keyof typeof ACCOUNT_NUMBER_FORMATS] ??
    null
  );
}

/** Whether this country's accounts are identified by an alias too. */
export function usesAccountAlias(countryAlpha2?: string | null): boolean {
  return accountNumberFormat(countryAlpha2) === "CBU_CVU";
}

const CBU_FIRST_BLOCK_WEIGHTS = [7, 1, 3, 9, 7, 1, 3];
const CBU_SECOND_BLOCK_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function checkDigit(digits: string, weights: number[]): number {
  const sum = digits
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * (weights[index] ?? 0), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Argentine CBU/CVU: 22 digits in two blocks, each closed by its own check digit
 * (bank block 7+1, account block 13+1). A CVU is the same shape issued by a PSP
 * instead of a bank, so one validator covers both — which is the point of the
 * scheme: the two are interchangeable for transfers.
 */
export function isValidCbu(value: string): boolean {
  const clean = value.replace(/[\s-]/g, "");
  if (!/^\d{22}$/.test(clean)) return false;
  const firstBlock = clean.slice(0, 8);
  const secondBlock = clean.slice(8);
  return (
    checkDigit(firstBlock.slice(0, 7), CBU_FIRST_BLOCK_WEIGHTS) === Number(firstBlock[7]) &&
    checkDigit(secondBlock.slice(0, 13), CBU_SECOND_BLOCK_WEIGHTS) === Number(secondBlock[13])
  );
}

/**
 * An account number valid for that country. Unknown country or unknown format =>
 * accepted: a catalogue that doesn't know a market must never block a real account
 * (the same permissive rule the institution catalogue follows).
 */
export function isValidAccountNumber(value: string, countryAlpha2?: string | null): boolean {
  if (!value.trim()) return false;
  return accountNumberFormat(countryAlpha2) === "CBU_CVU" ? isValidCbu(value) : true;
}

/**
 * An Argentine alias: 6-20 chars, letters/digits and `.-_`, no spaces. Case is
 * normalised to lowercase by the market, so compare accordingly.
 */
export function isValidAccountAlias(value: string): boolean {
  return /^[a-zA-Z0-9.\-_]{6,20}$/.test(value.trim());
}
