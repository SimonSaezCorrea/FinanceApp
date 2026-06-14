import { z } from "zod";

import { moneyString } from "../common/money";

/** Installments domain contracts (plan + scheduled payments). */

export const installmentPaymentSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  dueDate: z.string(),
  amount: moneyString,
  paidAt: z.string().nullable(),
});
export type InstallmentPayment = z.infer<typeof installmentPaymentSchema>;

export const installmentPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  totalPrincipal: moneyString,
  installmentCount: z.number().int().positive(),
  startDate: z.string(),
  currency: z.string(),
  notes: z.string().nullable(),
  payments: z.array(installmentPaymentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;

export const createInstallmentPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  totalPrincipal: moneyString,
  installmentCount: z.number().int().positive().max(600),
  startDate: z.string().datetime(),
  currency: z.string().trim().length(3).default("USD"),
  aprPerPeriod: moneyString.optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateInstallmentPlan = z.infer<typeof createInstallmentPlanSchema>;
