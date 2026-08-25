import { z } from "zod";

import { accountType, type AccountType } from "../common/account-type";
import { moneyString } from "../common/money";
import type { InstitutionKind } from "../reference";

export * from "./account-number";

/** Accounts domain contracts (BankAccount + cards). Money as decimal strings. */

/** Defined in `common/` so `reference` can use it too (see that file); re-exported
 * here because this is the domain that owns the concept. */
export { accountType, type AccountType };

/**
 * Deposit-taking account types are the ones you'd transfer money TO, so they
 * require a real `accountNumber` — a prepaid account included: it is funded by
 * transferring to its own number. CREDIT_CARD/INVESTMENT/CASH keep it optional.
 */
export const ACCOUNT_NUMBER_REQUIRED_TYPES: AccountType[] = [
  "CHECKING",
  "SIGHT",
  "SAVINGS",
  "PREPAID",
];

export function isAccountNumberRequired(type: AccountType): boolean {
  return ACCOUNT_NUMBER_REQUIRED_TYPES.includes(type);
}

/**
 * Deposit-taking account types (CHECKING/SIGHT/SAVINGS) can only be held at a bank,
 * so the institution picker narrows to `kind: "BANK"`. INVESTMENT and CREDIT_CARD are
 * left unfiltered: `kind` only distinguishes banks from non-bank *card* issuers, and
 * neither bucket cleanly represents investment managers (e.g. Fintual is seeded as a
 * NON_BANK_ISSUER for an unrelated prepaid-card entity, not because it's a card
 * issuer as an investment platform) — CREDIT_CARD, meanwhile, can legitimately be
 * issued by either kind. CASH has no institution field at all.
 */
export function institutionKindForAccountType(type: AccountType): InstitutionKind | undefined {
  const bankOnlyTypes: AccountType[] = ["CHECKING", "SIGHT", "SAVINGS"];
  return bankOnlyTypes.includes(type) ? "BANK" : undefined;
}

/**
 * Cash is the one account that exists whether or not an app models it — the notes
 * in a wallet. Every user keeps at least one, so the LAST cash account can't be
 * deleted (`CASH_ACCOUNT_REQUIRED`); a second one (a stash at home) still can.
 */
export function isDeletableAccount(type: AccountType, cashAccountCount: number): boolean {
  return type !== "CASH" || cashAccountCount > 1;
}

export const accountStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type AccountStatus = z.infer<typeof accountStatus>;

/** Whether the user intends to pay the credit statement manually or automatically.
 * Stored preference only — AUTOMATIC has no functional effect yet (see docs/PENDING.md). */
export const billingPaymentMethod = z.enum(["MANUAL", "AUTOMATIC"]);
export type BillingPaymentMethod = z.infer<typeof billingPaymentMethod>;

/** How a credit account's statement cut-off (`billingCycleDay`) is counted.
 * BUSINESS_DAY (días hábiles — the default for a new account) counts only
 * Mon-Fri Chilean business days, e.g. BCI's real-world "20 días hábiles"
 * after the previous period closed. CALENDAR_DAY is the original fixed
 * day-of-month behavior, kept for accounts already configured that way. */
export const billingCycleType = z.enum(["BUSINESS_DAY", "CALENDAR_DAY"]);
export type BillingCycleType = z.infer<typeof billingCycleType>;

// --- Cards (payment instruments; the physical "plastic") ---

export const cardKind = z.enum(["CREDIT", "DEBIT", "PREPAID"]);
export type CardKind = z.infer<typeof cardKind>;

/**
 * Which payment instruments each account type may carry. An empty list means the
 * account never has a card of its own (INVESTMENT/CASH: their funds move by
 * transferring into a cardable account first).
 *
 * Each product is kept apart because each holds a different kind of money:
 *  - CHECKING/SIGHT hold cash and are spent with a DEBIT card. **A credit card is
 *    NOT a channel onto a checking balance**: a purchase on it doesn't take money
 *    out of the account, it opens a debt with its own statement, minimum payment
 *    and cycle. Banks SELL them together as a "plan", but they are separate
 *    products with separate balances — so a credit card lives on its own
 *    `CREDIT_CARD` account here, and the payment of its statement is the
 *    (single, real) expense that leaves the checking account.
 *  - SAVINGS holds cash too and may carry a DEBIT card, used almost exclusively
 *    to withdraw at an ATM (BancoEstado, Coopeuch); the withdrawal limits that
 *    protect its interest are the bank's business, not this app's.
 *  - PREPAID holds funds provisioned up front and is spent ONLY with prepaid cards.
 */
export const ALLOWED_CARD_KINDS: Record<AccountType, CardKind[]> = {
  CHECKING: ["DEBIT"],
  SIGHT: ["DEBIT"],
  SAVINGS: ["DEBIT"],
  CREDIT_CARD: ["CREDIT"],
  PREPAID: ["PREPAID"],
  INVESTMENT: [],
  CASH: [],
};

export function allowedCardKinds(type: AccountType): CardKind[] {
  return ALLOWED_CARD_KINDS[type];
}

/** Whether this account type carries cards at all (any kind). */
export function isCardableAccountType(type: AccountType): boolean {
  return allowedCardKinds(type).length > 0;
}

export function isCardKindAllowed(type: AccountType, kind: CardKind): boolean {
  return allowedCardKinds(type).includes(kind);
}

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

/** Processing network a card runs on (Redcompra = the Chilean domestic one). */
export const cardNetwork = z.enum(["VISA", "MASTERCARD", "AMEX", "REDCOMPRA", "OTHER"]);
export type CardNetwork = z.infer<typeof cardNetwork>;

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
  /** No plastic: one of several virtual cards an issuer hands out on the same
   * account, often disposable. */
  isVirtual: z.boolean(),
  /** Issued to someone else against the same account or credit line — the charge
   * is still the holder's, but the app can say who made it. */
  isAdditional: z.boolean(),
  /** Name on the card, when it isn't the account owner's. */
  cardholderName: z.string().nullable(),
  /** Processing network, when known. */
  network: cardNetwork.nullable(),
  /** This CREDIT card's own Σexpense − Σincome, in the account's own currency
   * (derived) — its own contribution, whether it shares the account pool or
   * carries its own CardLimit. No seed baseline (only the account and a
   * CardLimit have one), so pre-existing debt not tied to a transaction isn't
   * reflected here even though it is in the account's own `creditUsed`. "0"
   * for non-CREDIT cards. */
  ownUsed: moneyString,
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
  /** No plastic — several of these can share one account (MACH, Tenpo, Chek). */
  isVirtual: z.boolean().optional().default(false),
  /** Issued to another person against the same account or credit line. */
  isAdditional: z.boolean().optional().default(false),
  cardholderName: z.string().trim().max(80).nullish(),
  network: cardNetwork.nullish(),
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

/** Account types that can hold an overdraft line: the ones holding cash you can
 * overdraw. A savings account is not overdrawn, and prepaid never goes negative. */
export const OVERDRAFT_ACCOUNT_TYPES: AccountType[] = ["CHECKING", "SIGHT"];

/** Account types that can carry a maximum balance: the ones a regulator or a
 * contract caps (a sight account like CuentaRUT, a prepaid account). */
export const BALANCE_CEILING_ACCOUNT_TYPES: AccountType[] = ["SIGHT", "PREPAID", "SAVINGS"];

export function allowsBalanceCeiling(type: AccountType): boolean {
  return BALANCE_CEILING_ACCOUNT_TYPES.includes(type);
}

export function allowsOverdraft(type: AccountType): boolean {
  return OVERDRAFT_ACCOUNT_TYPES.includes(type);
}

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
  /** The alias that identifies this account for transfers, where the market has
   * one (Argentina). Null elsewhere. */
  accountAlias: z.string().nullable(),
  initialBalance: moneyString,
  currentBalance: moneyString,
  /** How far below zero the balance may go (the bank's overdraft line on a current
   * account); "0" = none. Not a product of its own: it has no movements, it is the
   * floor this account's cash may reach. */
  overdraftLimit: moneyString,
  /** The most this account may hold (CuentaRUT and prepaid accounts are capped by
   * regulation). `null` = no ceiling declared, and then nothing is refused. */
  balanceCeiling: moneyString.nullable(),
  /** Credit pool for CREDIT_CARD accounts (shared by all its cards); "0" otherwise. */
  creditLimit: moneyString,
  /** Persisted, live used credit — seeded from creditUsedInitial, then mutated by
   * transactions and by paying down a CreditStatement (see POST /accounts/:id/pay-credit).
   * "0" for non-credit accounts. No longer derived/recomputed on read. */
  creditUsed: moneyString,
  /** All credit pools by currency (own currency + primary card's extra currencies, if any). Empty for non-credit accounts. */
  creditPools: z.array(creditPoolSchema),
  /** Statement cut-off, meaning depends on `billingCycleType`: a day-of-month
   * (1-28) for CALENDAR_DAY, or a count of business days for BUSINESS_DAY.
   * Informational only — no automatic reset; usage only goes down via an
   * explicit "pay credit" action. Null = not configured yet. */
  billingCycleDay: z.number().int().min(1).max(28).nullable(),
  /** How `billingCycleDay` is counted. Días hábiles (BUSINESS_DAY) by default. */
  billingCycleType: billingCycleType,
  /** Manual (default) or automatic credit-statement payment preference. AUTOMATIC has no
   * functional effect yet (see docs/PENDING.md). */
  paymentMethod: billingPaymentMethod,
  /** Business days (días hábiles) directly after a period's own close at which
   * payment is due (e.g. BCI's real-world "3 días hábiles"). Null = no due date
   * configured, and none is shown. */
  paymentDueDay: z.number().int().min(1).max(28).nullable(),
  /** Percentage of a statement that counts as its minimum payment (e.g. "5" = 5%).
   * No universal rule exists — each issuer sets its own — so it's per account.
   * Null = no minimum defined, and the UI offers no "minimum" option. */
  minimumPaymentPercent: z.string().nullable(),
  /** Reconciled running balance, one point per day over a trailing window (oldest→newest, ends at currentBalance). For sparklines. */
  balanceSeries: z.array(moneyString),
  /** Percent change across `balanceSeries` (e.g. "2.1"); null when the window has no meaningful baseline. */
  balanceChangePct: z.string().nullable(),
  cards: z.array(cardSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

/** The plain object half of the create shape. Kept separate because each `.refine()`
 * wraps the schema in a `ZodEffects`, which has neither `.partial()` nor a
 * chainable `.innerType()` — the PATCH shape derives from THIS. */
const bankAccountFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: accountType.default("CHECKING"),
  status: accountStatus.default("ACTIVE"),
  currency: z.string().trim().length(3).default("CLP"),
  institution: z.string().trim().max(120).optional(),
  institutionId: z.string().optional(),
  accountNumber: z.string().trim().max(50).optional(),
  accountAlias: z.string().trim().max(40).nullish(),
  initialBalance: moneyString.optional(),
  /** Overdraft line granted on this account (CHECKING/SIGHT only). */
  overdraftLimit: moneyString.optional(),
  /** Maximum balance this account may hold (SIGHT/PREPAID/SAVINGS only). */
  balanceCeiling: moneyString.nullish(),
  /** For CREDIT_CARD accounts: the credit pool and any pre-existing used seed. */
  creditLimit: moneyString.optional(),
  creditUsedInitial: moneyString.optional(),
  /** Statement cut-off (1-28); omit/null to leave unconfigured. Advanced setting —
   * intentionally not exposed in the create-account UI, only editable afterward. */
  billingCycleDay: z.number().int().min(1).max(28).nullable().optional(),
  /** Días hábiles (default) or a fixed day-of-month. */
  billingCycleType: billingCycleType.default("BUSINESS_DAY"),
  /** Advanced setting — not exposed in the create-account UI, only editable afterward. */
  paymentMethod: billingPaymentMethod.default("MANUAL"),
  /** Business days directly after a period's close at which payment is due;
   * omit/null to leave unconfigured. */
  paymentDueDay: z.number().int().min(1).max(28).nullable().optional(),
  /** Minimum-payment percentage (0-100); null clears it. */
  minimumPaymentPercent: z.string().nullable().optional(),
  cards: z.array(createCardSchema).optional(),
});

export const createBankAccountSchema = bankAccountFieldsSchema
  .refine((v) => !isAccountNumberRequired(v.type) || !!v.accountNumber?.trim(), {
    message: "accountNumber is required for this account type",
    path: ["accountNumber"],
  })
  // A prepaid account holds provisioned funds: it has no credit line, so it can't
  // start owing money, and none of the credit/billing settings apply to it.
  .refine((v) => v.type !== "PREPAID" || !v.initialBalance || !v.initialBalance.startsWith("-"), {
    message: "a prepaid account cannot start with a negative balance",
    path: ["initialBalance"],
  })
  // A credit pool and its billing settings belong to the account that IS a credit
  // line. No other type has one: a checking account's cash and a credit card's
  // debt are different products (see `ALLOWED_CARD_KINDS`).
  .refine((v) => v.type === "CREDIT_CARD" || !hasCreditSettings(v), {
    message: "only a credit-line account has a credit line and billing settings",
    path: ["creditLimit"],
  })
  // An overdraft is the floor of a cash balance: only the account types that hold
  // spendable cash can have one, and it is never negative.
  // "0" is not "has an overdraft" — it is what every account without one sends.
  .refine((v) => !isNonZeroMoney(v.overdraftLimit) || allowsOverdraft(v.type), {
    message: "only a checking or sight account can have an overdraft line",
    path: ["overdraftLimit"],
  })
  .refine((v) => !v.overdraftLimit?.startsWith("-"), {
    message: "an overdraft line cannot be negative",
    path: ["overdraftLimit"],
  })
  .refine((v) => !v.balanceCeiling || allowsBalanceCeiling(v.type), {
    message: "this account type has no balance ceiling",
    path: ["balanceCeiling"],
  })
  // The kinds a card may take depend on the account carrying it; the inline
  // `cards[]` path must obey the same matrix the dedicated card endpoints do.
  .refine((v) => (v.cards ?? []).every((c) => isCardKindAllowed(v.type, c.kind)), {
    message: "this card kind is not allowed on this account type",
    path: ["cards"],
  });

function hasCreditSettings(v: {
  creditLimit?: string;
  creditUsedInitial?: string;
  billingCycleDay?: number | null;
  paymentDueDay?: number | null;
  minimumPaymentPercent?: string | null;
}): boolean {
  return (
    isNonZeroMoney(v.creditLimit) ||
    isNonZeroMoney(v.creditUsedInitial) ||
    v.billingCycleDay != null ||
    v.paymentDueDay != null ||
    v.minimumPaymentPercent != null
  );
}

function isNonZeroMoney(value: string | undefined): boolean {
  return value != null && Number(value) !== 0;
}
export type CreateBankAccount = z.infer<typeof createBankAccountSchema>;

// `.partial()` isn't available on a ZodEffects (refined) schema, so derive the
// update shape from the plain fields. `type` may be omitted on a PATCH, so none of
// the create-time refinements is (or can be) replicated here — they're enforced in
// the aggregate instead, where the current row's type is known.
export const updateBankAccountSchema = bankAccountFieldsSchema.partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccountSchema>;

export const setAccountStatusSchema = z.object({ status: accountStatus });
export type SetAccountStatus = z.infer<typeof setAccountStatusSchema>;

/** Derived (not persisted) lifecycle of a `CreditStatement`: OPEN (still accumulating
 * — transactions keep linking to it), PENDING (closed by generation, awaiting
 * payment), PAID. */
/** Any payment — the total, the minimum or anything between — SETTLES the period,
 * and the shortfall is carried into the next one as its `carriedOverAmount`. A
 * period settled with less than its total is therefore not payable either, but it
 * reports **PARTIALLY_PAID** rather than PAID: what was actually covered
 * (`paidAmount`) is a fact worth naming instead of hiding behind "Pagada". */
export const creditStatementStatus = z.enum(["OPEN", "PENDING", "PARTIALLY_PAID", "PAID"]);
export type CreditStatementStatus = z.infer<typeof creditStatementStatus>;

/** A billing period ("facturación") for an account's shared credit pool. While
 * unpaid, `amount` is the LIVE sum of transactions linked to it (computed
 * server-side, not user-editable); once paid, it's a frozen snapshot that CAN be
 * corrected manually (no cascade to the linked payment or to `creditUsed` —
 * a deliberate simplification for personal use). */
export const creditStatementSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  status: creditStatementStatus,
  periodStart: z.string(),
  /** Set once generation seals this period (cron or manual button). Null while OPEN. */
  closedAt: z.string().nullable(),
  /** Set once paid. Null while OPEN/PENDING. */
  paidAt: z.string().nullable(),
  /** When payment is due — the account's configured `paymentDueDay` business
   * days directly after this period's own close. Null while OPEN (nothing to
   * count from yet) or when the account has no `paymentDueDay` configured. */
  dueDate: z.string().nullable(),
  /** Everything this period owes: its own movements PLUS `carriedOverAmount`. */
  amount: moneyString,
  /** What was actually paid. "0" until the period is paid; may be less than
   * `amount` — the difference went to the next period. */
  paidAmount: moneyString,
  /** Debt brought forward from the previous period, because that one was settled
   * with less than its total. Already included in `amount`. "0" normally. */
  carriedOverAmount: moneyString,
  /** The period this one's shortfall was rolled into. Null when paid in full. */
  carriedToId: z.string().nullable(),
  /** What's still owed for this period: `amount` − `paidAmount`, never negative.
   * Always "0" once paid — the shortfall is owed in the NEXT period, not here. */
  remainingAmount: moneyString,
  /** The minimum this period accepts as a payment, from the account's configured
   * percentage. Null when the account has no minimum configured. */
  minimumAmount: moneyString.nullable(),
  /** What the period is made of. Derived from the transactions linked to it —
   * purchases vs. installment charges — never stored. */
  breakdown: z.object({
    purchases: moneyString,
    installments: moneyString,
    /** How many installment charges make up `installments`. */
    installmentCount: z.number().int(),
  }),
  /** The bank account paid from, if paid. Null otherwise. */
  paidFromAccountId: z.string().nullable(),
  /** The real EXPENSE transaction created on `paidFromAccountId` at pay time. */
  paidTransactionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CreditStatement = z.infer<typeof creditStatementSchema>;

/** Pay a statement by choosing a source bank account (must not be CREDIT_CARD).
 *
 * `amount` omitted = pay everything owed. A smaller amount (typically the
 * minimum) still SETTLES the period: what it doesn't cover is carried into the
 * next period as its `carriedOverAmount`. Paying more than what's owed is
 * rejected (`PAYMENT_EXCEEDS_REMAINING`) rather than silently capped — a wrong
 * figure in a money form must not be quietly "corrected". */
export const payCreditStatementSchema = z.object({
  fromAccountId: z.string(),
  amount: moneyString.optional(),
  /** When the payment happened; defaults to now. Dates the created expense too. */
  paidAt: z.string().optional(),
  /** Free-text note carried onto the payment movement (e.g. a transfer number). */
  reference: z.string().trim().max(200).optional(),
});
export type PayCreditStatement = z.infer<typeof payCreditStatementSchema>;

/** Correct what was actually paid on an ALREADY SETTLED period (`STATEMENT_NOT_PAID`
 * otherwise) — the figure was mistyped, or more was transferred later.
 *
 * This is NOT the retired manual "correct the period's amount": the period's total
 * still comes from its real movements (`POST .../sync`) and is never typed in. Only
 * the PAYMENT moves, and everything that followed from it moves with it: the payment
 * movement's amount, the source account's balance, the credit pool, and the shortfall
 * carried into the next period. It must be positive and cannot exceed the period's
 * total (`PAYMENT_EXCEEDS_REMAINING`); paying the total makes the period PAID. */
export const updateStatementPaymentSchema = z.object({
  amount: moneyString,
});
export type UpdateStatementPayment = z.infer<typeof updateStatementPaymentSchema>;

/** List query filters. */
export const accountFiltersSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
});
export type AccountFilters = z.infer<typeof accountFiltersSchema>;
