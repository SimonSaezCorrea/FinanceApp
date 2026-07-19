import { z } from "zod";

import { moneyString } from "../common/money";
import type { InstitutionKind } from "../reference";

/** Accounts domain contracts (BankAccount + cards). Money as decimal strings. */

export const accountType = z.enum([
  "CHECKING", // Corriente
  "SIGHT", // Vista / Cuenta RUT
  "SAVINGS", // Ahorro
  "INVESTMENT", // Inversiones (Fintual)
  "CREDIT_LINE", // Línea de crédito (tarjeta de crédito sin cuenta bancaria)
  "CASH", // Efectivo
]);
export type AccountType = z.infer<typeof accountType>;

/**
 * Only these account types can carry a physical/digital card. A debit card is
 * the mandatory instrument for CHECKING/SIGHT; a CREDIT_LINE's card(s) share
 * its credit pool. SAVINGS, INVESTMENT and CASH never have their own card —
 * moving their funds means transferring into a cardable account first.
 */
export const CARDABLE_ACCOUNT_TYPES: AccountType[] = ["CHECKING", "SIGHT", "CREDIT_LINE"];

export function isCardableAccountType(type: AccountType): boolean {
  return CARDABLE_ACCOUNT_TYPES.includes(type);
}

/**
 * Deposit-taking account types (CHECKING/SIGHT/SAVINGS) are the ones you'd transfer
 * money TO, so they require a real `accountNumber`. CREDIT_LINE/INVESTMENT/CASH keep
 * it optional.
 */
export const ACCOUNT_NUMBER_REQUIRED_TYPES: AccountType[] = ["CHECKING", "SIGHT", "SAVINGS"];

export function isAccountNumberRequired(type: AccountType): boolean {
  return ACCOUNT_NUMBER_REQUIRED_TYPES.includes(type);
}

/**
 * Deposit-taking account types (CHECKING/SIGHT/SAVINGS) can only be held at a bank,
 * so the institution picker narrows to `kind: "BANK"`. INVESTMENT and CREDIT_LINE are
 * left unfiltered: `kind` only distinguishes banks from non-bank *card* issuers, and
 * neither bucket cleanly represents investment managers (e.g. Fintual is seeded as a
 * NON_BANK_ISSUER for an unrelated prepaid-card entity, not because it's a card
 * issuer as an investment platform) — CREDIT_LINE, meanwhile, can legitimately be
 * issued by either kind. CASH has no institution field at all.
 */
export function institutionKindForAccountType(type: AccountType): InstitutionKind | undefined {
  const bankOnlyTypes: AccountType[] = ["CHECKING", "SIGHT", "SAVINGS"];
  return bankOnlyTypes.includes(type) ? "BANK" : undefined;
}

export const accountStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type AccountStatus = z.infer<typeof accountStatus>;

// --- Cards (payment instruments; the physical "plastic") ---

export const cardKind = z.enum(["CREDIT", "DEBIT", "PREPAID"]);
export type CardKind = z.infer<typeof cardKind>;

/**
 * A card-specific sub-limit for one currency — optional and narrower than the
 * account's own shared `creditLimit` pool, which remains the master cap across
 * every card on the account. Only meaningful for CREDIT-kind cards.
 */
export const cardLimitSchema = z.object({
  id: z.string(),
  currency: z.string(),
  limitAmount: moneyString,
  /** Reconciled used = usedInitial + Σexpense − Σincome on this card+currency (derived). */
  used: moneyString,
});
export type CardLimit = z.infer<typeof cardLimitSchema>;

export const createCardLimitSchema = z.object({
  currency: z.string().trim().length(3),
  limitAmount: moneyString,
  usedInitial: moneyString.optional(),
});
export type CreateCardLimit = z.infer<typeof createCardLimitSchema>;

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: cardKind,
  last4: z.string().regex(/^\d{4}$/),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2000).max(2100),
  isActive: z.boolean(),
  /** The account's first CREDIT card (set automatically). Its limit mirrors the
   * account's own creditLimit/creditUsedInitial — `limits` never has an entry for
   * the account's own currency, only for any EXTRA currency it also carries. */
  isPrimary: z.boolean(),
  limits: z.array(cardLimitSchema),
});
export type Card = z.infer<typeof cardSchema>;

/**
 * Card creation — ONLY last4 is accepted; the full PAN must never be sent.
 * For a CREDIT card, exactly one of these applies (enforced server-side, since
 * "is this the account's primary card" depends on what else already exists):
 *  - it becomes the account's PRIMARY (its first CREDIT card): `limits` must have
 *    one entry in the account's own currency — written to the account's
 *    creditLimit/creditUsedInitial, not stored as a CardLimit row. Any OTHER
 *    entries (different currencies) DO become real CardLimit rows on it —
 *    independent per-currency pools, same as an additional card's own sub-limit.
 *  - it's an additional card sharing the account pool: `usesAccountPool: true`
 *    (the default), `limits` ignored.
 *  - it's an additional card with its own sub-limit ("tope propio"):
 *    `usesAccountPool: false` + `limits` (one entry per currency).
 */
export const createCardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: cardKind,
  last4: z.string().regex(/^\d{4}$/, "must be exactly 4 digits"),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2000).max(2100),
  isActive: z.boolean().optional().default(true),
  /** Non-primary CREDIT cards only: share the account pool (true, default) or use `limits` instead. */
  usesAccountPool: z.boolean().optional().default(true),
  limits: z.array(createCardLimitSchema).optional(),
});
export type CreateCard = z.infer<typeof createCardSchema>;

/**
 * One of the account's shared credit pools, by currency: the account's own
 * currency (same numbers as `creditLimit`/`creditUsed` below) plus, if the
 * primary card carries an extra-currency `CardLimit`, one entry per such
 * currency — e.g. a CLP account whose primary card also has a USD sub-limit
 * shows both here. A non-primary card's own sub-limit is NOT included (that
 * stays scoped to that card alone, not rolled up to the account).
 */
export const creditPoolSchema = z.object({
  currency: z.string(),
  limit: moneyString,
  used: moneyString,
});
export type CreditPool = z.infer<typeof creditPoolSchema>;

export const bankAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: accountType,
  status: accountStatus,
  currency: z.string(),
  institution: z.string().nullable(),
  /** Linked financial institution (bank or non-bank issuer) id; null for cash/manual. */
  institutionId: z.string().nullable(),
  /** Resolved institution name (from the link), for display; null when unlinked. */
  institutionName: z.string().nullable(),
  /** Bank account number (free text, full — not a card PAN). Null for cash. */
  accountNumber: z.string().nullable(),
  initialBalance: moneyString,
  currentBalance: moneyString,
  /** Credit pool for CREDIT_LINE accounts (shared by all its cards); "0" otherwise. */
  creditLimit: moneyString,
  /** Reconciled used credit = creditUsedInitial + Σexpense − Σincome (derived). "0" for non-credit. */
  creditUsed: moneyString,
  /** All credit pools by currency (own currency + primary card's extra currencies, if any). Empty for non-credit accounts. */
  creditPools: z.array(creditPoolSchema),
  /** Reconciled running balance, one point per day over a trailing window (oldest→newest, ends at currentBalance). For sparklines. */
  balanceSeries: z.array(moneyString),
  /** Percent change across `balanceSeries` (e.g. "2.1"); null when the window has no meaningful baseline. */
  balanceChangePct: z.string().nullable(),
  cards: z.array(cardSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const createBankAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: accountType.default("CHECKING"),
  status: accountStatus.default("ACTIVE"),
  currency: z.string().trim().length(3).default("CLP"),
  institution: z.string().trim().max(120).optional(),
  institutionId: z.string().optional(),
  accountNumber: z.string().trim().max(50).optional(),
  initialBalance: moneyString.optional(),
  /** For CREDIT_LINE accounts: the credit pool and any pre-existing used seed. */
  creditLimit: moneyString.optional(),
  creditUsedInitial: moneyString.optional(),
  cards: z.array(createCardSchema).optional(),
}).refine((v) => !isAccountNumberRequired(v.type) || !!v.accountNumber?.trim(), {
  message: "accountNumber is required for this account type",
  path: ["accountNumber"],
});
export type CreateBankAccount = z.infer<typeof createBankAccountSchema>;

// `.partial()` isn't available on a ZodEffects (refined) schema, so derive the
// update shape from the inner object. `type` may be omitted on a PATCH, so the
// accountNumber-required refinement isn't (and can't be) replicated here — it's
// enforced in the API service layer instead, where the current row's type is known.
export const updateBankAccountSchema = createBankAccountSchema.innerType().partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccountSchema>;

export const setAccountStatusSchema = z.object({ status: accountStatus });
export type SetAccountStatus = z.infer<typeof setAccountStatusSchema>;

/** List query filters. */
export const accountFiltersSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
});
export type AccountFilters = z.infer<typeof accountFiltersSchema>;
