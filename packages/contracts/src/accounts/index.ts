import { z } from "zod";

import { moneyString } from "../common/money";

/** Accounts domain contracts (BankAccount). Money as decimal strings. */

export const accountType = z.enum([
  "CHECKING",
  "SAVINGS",
  "VISTA",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CASH",
  "OTHER",
]);
export type AccountType = z.infer<typeof accountType>;

export const accountStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type AccountStatus = z.infer<typeof accountStatus>;

// --- Cards ---

export const cardKind = z.enum(["CREDIT", "DEBIT"]);
export type CardKind = z.infer<typeof cardKind>;

export const cardLimitSchema = z.object({
  currency: z.string().trim().length(3),
  limit: moneyString,
  used: moneyString,
});
export type CardLimit = z.infer<typeof cardLimitSchema>;

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: cardKind,
  last4: z.string().regex(/^\d{4}$/),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2000).max(2100),
  limits: z.array(cardLimitSchema),
});
export type Card = z.infer<typeof cardSchema>;

/** Card creation — ONLY last4 is accepted; the full PAN must never be sent. */
export const createCardSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: cardKind,
    last4: z.string().regex(/^\d{4}$/, "must be exactly 4 digits"),
    expiryMonth: z.number().int().min(1).max(12),
    expiryYear: z.number().int().min(2000).max(2100),
    limits: z.array(cardLimitSchema).optional(),
  })
  .refine((c) => c.kind === "CREDIT" || !c.limits || c.limits.length === 0, {
    message: "debit cards cannot have limits",
    path: ["limits"],
  })
  .refine(
    (c) => {
      const cur = (c.limits ?? []).map((l) => l.currency);
      return new Set(cur).size === cur.length;
    },
    { message: "duplicate currency in limits", path: ["limits"] },
  );
export type CreateCard = z.infer<typeof createCardSchema>;

export const bankAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: accountType,
  status: accountStatus,
  currency: z.string(),
  institution: z.string().nullable(),
  initialBalance: moneyString,
  currentBalance: moneyString,
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
  type: accountType.default("OTHER"),
  status: accountStatus.default("ACTIVE"),
  currency: z.string().trim().length(3).default("USD"),
  institution: z.string().trim().max(120).optional(),
  initialBalance: moneyString.optional(),
  cards: z.array(createCardSchema).optional(),
});
export type CreateBankAccount = z.infer<typeof createBankAccountSchema>;

export const updateBankAccountSchema = createBankAccountSchema.partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccountSchema>;

export const setAccountStatusSchema = z.object({ status: accountStatus });
export type SetAccountStatus = z.infer<typeof setAccountStatusSchema>;

/** List query filters. */
export const accountFiltersSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
});
export type AccountFilters = z.infer<typeof accountFiltersSchema>;
