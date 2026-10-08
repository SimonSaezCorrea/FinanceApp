import { z } from "zod";

import { cardKind, cardNetwork, accountStatus } from "../accounts/index";
import { accountType } from "../common/account-type";
import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";
import { debtDirection } from "../debts/index";
import { installmentFrequency } from "../installments/index";
import { recurrenceFrequency } from "../recurring/index";

/**
 * The official Cuadra template (specs/027): a spreadsheet the user downloads with
 * their own accounts, cards and categories, fills in and uploads back. Unlike the
 * statement importer (`importTransactionsRequestSchema`, ONE account), each sheet
 * says what its rows ARE — movements, transfers, debts and their payments,
 * instalment plans and their payments, recurring series, savings goals and their
 * contributions — so nothing has to be guessed.
 *
 * The browser reads the file and resolves names to ids; the API revalidates
 * everything and applies it all-or-nothing. Every row carries `row`: the Excel row
 * it came from (the header is row 1), so an error lands on its own cell.
 */

/** Bumped whenever sheets or columns change incompatibly; a file stamped with
 * another version is refused with "download the current template". */
export const TEMPLATE_VERSION = 2;

/** Most rows one template may carry, across all sheets. */
export const TEMPLATE_IMPORT_MAX_ROWS = 5000;

/** Stable sheet keys — the API's errors name these, the web maps them to the
 * localized sheet names. Order = the order sheets appear in the file, which is
 * also the tie-breaker when two money movements share a date. */
export const templateSheetKey = z.enum([
  "accounts",
  "cards",
  "movements",
  "transfers",
  "debts",
  "debtPayments",
  "plans",
  "planPayments",
  "recurring",
  "goals",
  "contributions",
  "statements",
]);
export type TemplateSheetKey = z.infer<typeof templateSheetKey>;
export const TEMPLATE_SHEET_KEYS = templateSheetKey.options;

const positiveMoney = moneyString.refine((v) => !v.startsWith("-") && Number(v) > 0, {
  message: "must be a positive amount",
});
const excelRow = z.number().int().min(2);
const currency = z.string().trim().length(3);
const ref = z.string().trim().min(1).max(80);
const text = (max: number) => z.string().trim().max(max).optional();

export const templateMovementSchema = z.object({
  row: excelRow,
  occurredAt: z.string().datetime(),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: positiveMoney,
  /** Omitted = the account's own currency. Another one is only accepted on a
   * credit card account whose card has its own limit in it (e.g. USD). */
  currency: currency.optional(),
  bankAccountId: rowId,
  cardId: rowId.optional(),
  categoryId: rowId.optional(),
  description: text(500),
  observation: text(500),
  emisor: text(200),
  receptor: text(200),
  lugar: text(200),
  financeCharge: z.boolean().optional(),
  /** The `ref` of a row in the Recurring sheet this movement is a payment of. */
  recurringRef: ref.optional(),
});
export type TemplateMovement = z.infer<typeof templateMovementSchema>;

export const templateTransferSchema = z.object({
  row: excelRow,
  occurredAt: z.string().datetime(),
  fromAccountId: rowId,
  toAccountId: rowId,
  outgoingAmount: positiveMoney,
  incomingAmount: positiveMoney,
  description: text(500),
});
export type TemplateTransfer = z.infer<typeof templateTransferSchema>;

export const templateDebtSchema = z.object({
  row: excelRow,
  ref,
  direction: debtDirection,
  counterparty: z.string().trim().min(1).max(160),
  title: text(160),
  principal: positiveMoney,
  currency,
  openedAt: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
  totalInstallments: z.number().int().min(1).max(600),
  frequency: installmentFrequency,
  frequencyInterval: z.number().int().min(1).max(999),
  paymentAccountId: rowId.optional(),
  notes: text(500),
});
export type TemplateDebt = z.infer<typeof templateDebtSchema>;

export const templateDebtPaymentSchema = z.object({
  row: excelRow,
  debtRef: ref,
  paidAt: z.string().datetime(),
  accountId: rowId,
  /** Optional: when present it must equal THAT instalment's amount. */
  amount: positiveMoney.optional(),
});
export type TemplateDebtPayment = z.infer<typeof templateDebtPaymentSchema>;

export const templatePlanSchema = z.object({
  row: excelRow,
  ref,
  title: z.string().trim().min(1).max(160),
  startDate: z.string().datetime(),
  totalPrincipal: positiveMoney,
  installmentCount: z.number().int().positive().max(600),
  currency,
  frequency: installmentFrequency,
  frequencyInterval: z.number().int().min(1).max(999),
  aprPerPeriod: moneyString.optional(),
  cardId: rowId.optional(),
  categoryId: rowId.optional(),
  paymentAccountId: rowId.optional(),
});
export type TemplatePlan = z.infer<typeof templatePlanSchema>;

export const templatePlanPaymentSchema = z.object({
  row: excelRow,
  planRef: ref,
  sequence: z.number().int().min(1),
  paidAt: z.string().datetime(),
  /** Required on a plan NOT charged to a credit card (the payment is real money
   * out of this account); forbidden on a credit card plan (paying it happens
   * through the card's statement — an imported one is "already settled"). */
  accountId: rowId.optional(),
  amount: positiveMoney.optional(),
  /** Credit card plans only: whether marking it paid gives its share of the pool
   * back. Default yes (it was settled outside the app). No when the card payment
   * that covered it is itself in the file (a transfer to the card), which already
   * lowered the pool: freeing it again would count that money twice. */
  freesCredit: z.boolean().optional(),
});
export type TemplatePlanPayment = z.infer<typeof templatePlanPaymentSchema>;

export const templateRecurringSchema = z.object({
  row: excelRow,
  /** Only needed when movements point at this series. */
  ref: ref.optional(),
  label: z.string().trim().min(1).max(160),
  amount: positiveMoney,
  currency,
  frequency: recurrenceFrequency,
  interval: z.number().int().min(1).max(366),
  anchorDate: z.string().datetime(),
  /** Last occurrence (inclusive) of a series that ended. */
  endDate: z.string().datetime().optional(),
  bankAccountId: rowId.optional(),
  cardId: rowId.optional(),
  categoryId: rowId.optional(),
  notes: text(500),
});
export type TemplateRecurring = z.infer<typeof templateRecurringSchema>;

export const templateGoalSchema = z.object({
  row: excelRow,
  ref,
  title: z.string().trim().min(1).max(160),
  targetAmount: positiveMoney,
  currency,
  deadline: z.string().datetime().optional(),
  notes: text(500),
});
export type TemplateGoal = z.infer<typeof templateGoalSchema>;

export const templateContributionSchema = z.object({
  row: excelRow,
  goalRef: ref,
  contributedAt: z.string().datetime(),
  amount: positiveMoney,
  bankAccountId: rowId,
});
export type TemplateContribution = z.infer<typeof templateContributionSchema>;

/**
 * An account the file defines (version 2). `id` is a TEMPORARY key minted by the
 * browser so the other sheets can point at it before it exists; the API never
 * stores it — it creates the account with an id of its own and translates every
 * reference. `openingBalance` is the balance BEFORE the first imported movement
 * (credit card accounts: `creditUsedInitial`, the debt before them).
 */
export const templateAccountSchema = z.object({
  row: excelRow,
  id: rowId,
  name: z.string().trim().min(1).max(120),
  type: accountType,
  status: accountStatus.default("ACTIVE"),
  currency,
  institution: text(120),
  institutionId: rowId.optional(),
  accountNumber: text(50),
  openingBalance: moneyString.default("0"),
  overdraftLimit: moneyString.optional(),
  balanceCeiling: moneyString.optional(),
  creditLimit: moneyString.optional(),
  creditUsedInitial: moneyString.optional(),
  minimumPaymentPercent: moneyString.optional(),
});
export type TemplateAccount = z.infer<typeof templateAccountSchema>;

/** A card the file defines; `id` is temporary, like an account's. The first
 * CREDIT card of an account is its primary one (its limit IS the account's
 * `creditLimit`); another one shares that pool unless it declares its own limit. */
export const templateCardSchema = z.object({
  row: excelRow,
  id: rowId,
  accountId: rowId,
  kind: cardKind,
  last4: z.string().regex(/^\d{4}$/),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2000).max(2100),
  name: text(80),
  network: cardNetwork.optional(),
  isVirtual: z.boolean().optional(),
  isAdditional: z.boolean().optional(),
  cardholderName: text(120),
  isActive: z.boolean().optional(),
  /** Its own limit in the account's currency (an additional CREDIT card that
   * doesn't share the pool). Omitted = shares the account's pool. */
  ownLimit: positiveMoney.optional(),
  /** A limit in another currency (e.g. the USD one of a CLP card). */
  extraLimitCurrency: currency.optional(),
  extraLimit: positiveMoney.optional(),
});
export type TemplateCard = z.infer<typeof templateCardSchema>;

/** A billing period of a credit card account, with the dates printed on the
 * bank's statement — what "Generar facturación" records. Paying it is
 * bookkeeping only: the money that paid it is a transfer in the Transfers sheet. */
export const templateStatementSchema = z
  .object({
    row: excelRow,
    accountId: rowId,
    /** Omitted = the account's own currency. */
    currency: currency.optional(),
    periodStart: z.string().datetime(),
    closedAt: z.string().datetime(),
    dueDate: z.string().datetime(),
    paidAt: z.string().datetime().optional(),
    /** Omitted with `paidAt` = paid in full. Less than the total rolls the rest
     * into the next period. */
    paidAmount: positiveMoney.optional(),
    /** The account the payment came out of: then the import records it like the
     * "Pagar" button (an expense there, the card's pool down). Omitted = the money
     * is already a transfer in the Transfers sheet and this only marks it paid. */
    paidFromAccountId: rowId.optional(),
  })
  .refine((s) => !s.paidFromAccountId || (!!s.paidAt && !!s.paidAmount), {
    message: "a payment from an account needs its date and amount",
    path: ["paidFromAccountId"],
  });
export type TemplateStatement = z.infer<typeof templateStatementSchema>;

/** `MERGE` adds the file's rows to what the app already holds. `REPLACE` deletes
 * every account, card and record of the user first and rebuilds them from the
 * file — the file is then the whole history. */
export const templateImportMode = z.enum(["MERGE", "REPLACE"]);
export type TemplateImportMode = z.infer<typeof templateImportMode>;

/** Per account: does its CURRENT balance already include what's being imported
 * (the usual case when migrating — the account was created with today's real
 * balance) or should the import add to it? `INCLUDED` moves the opening balance
 * instead, so today's balance doesn't change. */
export const balanceMode = z.enum(["INCLUDED", "ADD"]);
export type BalanceMode = z.infer<typeof balanceMode>;

export const balanceModeSchema = z.object({ accountId: rowId, mode: balanceMode });

const sheet = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).default([]);

export const templateImportRequestSchema = z
  .object({
    mode: templateImportMode.default("MERGE"),
    /** An affected account missing here is `INCLUDED`. Accounts the file itself
     * defines are always `ADD`: their opening balance is in the Accounts sheet. */
    balanceModes: z.array(balanceModeSchema).default([]),
    accounts: sheet(templateAccountSchema),
    cards: sheet(templateCardSchema),
    movements: sheet(templateMovementSchema),
    transfers: sheet(templateTransferSchema),
    debts: sheet(templateDebtSchema),
    debtPayments: sheet(templateDebtPaymentSchema),
    plans: sheet(templatePlanSchema),
    planPayments: sheet(templatePlanPaymentSchema),
    recurring: sheet(templateRecurringSchema),
    goals: sheet(templateGoalSchema),
    contributions: sheet(templateContributionSchema),
    statements: sheet(templateStatementSchema),
  })
  .refine(
    (req) => {
      const total = TEMPLATE_SHEET_KEYS.reduce((n, key) => n + req[key].length, 0);
      return total >= 1 && total <= TEMPLATE_IMPORT_MAX_ROWS;
    },
    { message: `between 1 and ${TEMPLATE_IMPORT_MAX_ROWS} rows across all sheets` },
  );
export type TemplateImportRequest = z.infer<typeof templateImportRequestSchema>;
export type TemplateImportInput = z.input<typeof templateImportRequestSchema>;

export const templateSheetCountsSchema = z.object(
  Object.fromEntries(TEMPLATE_SHEET_KEYS.map((k) => [k, z.number().int().nonnegative()])) as Record<
    TemplateSheetKey,
    z.ZodNumber
  >,
);
export type TemplateSheetCounts = z.infer<typeof templateSheetCountsSchema>;

/** One problem, located on its sheet and Excel row. `code` is a language-agnostic
 * error code the web maps to `errors.<CODE>`. */
export const templateIssueSchema = z.object({
  code: z.string(),
  sheet: templateSheetKey,
  row: z.number().int(),
  field: z.string().optional(),
});
export type TemplateIssue = z.infer<typeof templateIssueSchema>;

/** What the import does to one account. Figures are the account's own currency. */
export const templateAccountEffectSchema = z.object({
  accountId: rowId,
  currency: z.string(),
  mode: balanceMode,
  /** Σ of what the imported rows do to the cash balance. */
  netCash: moneyString,
  /** Σ of what they do to the credit card pool (`creditUsed`). */
  netCredit: moneyString,
  balanceAfter: moneyString,
  creditUsedAfter: moneyString,
});
export type TemplateAccountEffect = z.infer<typeof templateAccountEffectSchema>;

/** What a `REPLACE` import deletes before rebuilding — counted, so the user sees
 * it before confirming. Null on a `MERGE`. */
export const templateReplacementSchema = z.object({
  accounts: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
  movements: z.number().int().nonnegative(),
  debts: z.number().int().nonnegative(),
  plans: z.number().int().nonnegative(),
  recurring: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  statements: z.number().int().nonnegative(),
});
export type TemplateReplacement = z.infer<typeof templateReplacementSchema>;

export const templatePreviewResponseSchema = z.object({
  valid: z.boolean(),
  replaces: templateReplacementSchema.nullable().default(null),
  counts: templateSheetCountsSchema,
  accounts: z.array(templateAccountEffectSchema),
  errors: z.array(templateIssueSchema),
});
export type TemplatePreviewResponse = z.infer<typeof templatePreviewResponseSchema>;

export const templateImportResultSchema = z.object({ counts: templateSheetCountsSchema });
export type TemplateImportResult = z.infer<typeof templateImportResultSchema>;
