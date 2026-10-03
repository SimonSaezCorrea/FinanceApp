import { z } from "zod";

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
export const TEMPLATE_VERSION = 1;

/** Most rows one template may carry, across all sheets. */
export const TEMPLATE_IMPORT_MAX_ROWS = 5000;

/** Stable sheet keys — the API's errors name these, the web maps them to the
 * localized sheet names. Order = the order sheets appear in the file, which is
 * also the tie-breaker when two money movements share a date. */
export const templateSheetKey = z.enum([
  "movements",
  "transfers",
  "debts",
  "debtPayments",
  "plans",
  "planPayments",
  "recurring",
  "goals",
  "contributions",
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
    /** An affected account missing here is `INCLUDED`. */
    balanceModes: z.array(balanceModeSchema).default([]),
    movements: sheet(templateMovementSchema),
    transfers: sheet(templateTransferSchema),
    debts: sheet(templateDebtSchema),
    debtPayments: sheet(templateDebtPaymentSchema),
    plans: sheet(templatePlanSchema),
    planPayments: sheet(templatePlanPaymentSchema),
    recurring: sheet(templateRecurringSchema),
    goals: sheet(templateGoalSchema),
    contributions: sheet(templateContributionSchema),
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

export const templatePreviewResponseSchema = z.object({
  valid: z.boolean(),
  counts: templateSheetCountsSchema,
  accounts: z.array(templateAccountEffectSchema),
  errors: z.array(templateIssueSchema),
});
export type TemplatePreviewResponse = z.infer<typeof templatePreviewResponseSchema>;

export const templateImportResultSchema = z.object({ counts: templateSheetCountsSchema });
export type TemplateImportResult = z.infer<typeof templateImportResultSchema>;
