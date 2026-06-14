import { z } from "zod";

/** Investments domain contracts. Decimal fields cross the boundary as RAW decimal strings. */

export const investmentKind = z.enum(["ETF", "REMUNERATED_ACCOUNT"]);
export type InvestmentKind = z.infer<typeof investmentKind>;

export const investmentSchema = z.object({
  id: z.string(),
  kind: investmentKind,
  label: z.string(),
  currency: z.string(),
  symbol: z.string().nullable(),
  shares: z.string().nullable(),
  annualRate: z.string().nullable(),
  principal: z.string().nullable(),
  bankAccountId: z.string().nullable(),
  openedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Investment = z.infer<typeof investmentSchema>;

export const createInvestmentSchema = z.object({
  kind: investmentKind,
  label: z.string().trim().min(1).max(160),
  currency: z.string().trim().length(3).default("USD"),
  symbol: z.string().trim().max(20).optional(),
  shares: z.string().optional(),
  annualRate: z.string().optional(),
  principal: z.string().optional(),
  bankAccountId: z.string().optional(),
  openedAt: z.string().datetime().optional(),
});
export type CreateInvestment = z.infer<typeof createInvestmentSchema>;

export const updateInvestmentSchema = createInvestmentSchema.partial();
export type UpdateInvestment = z.infer<typeof updateInvestmentSchema>;
