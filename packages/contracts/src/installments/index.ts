import { z } from "zod";

import { moneyString } from "../common/money";

/** Installments domain contracts (plan + scheduled payments). */

export const installmentFrequency = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
export type InstallmentFrequency = z.infer<typeof installmentFrequency>;

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
  frequency: installmentFrequency,
  frequencyInterval: z.number().int().positive(),
  /** The card this purchase was put on, when there was one — a plan can equally
   * be a bank loan with no card behind it. */
  cardId: z.string().nullable(),
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
  frequency: installmentFrequency.default("MONTHLY"),
  frequencyInterval: z.number().int().min(1).max(999).default(1),
  aprPerPeriod: moneyString.optional(),
  cardId: z.string().nullish(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateInstallmentPlan = z.infer<typeof createInstallmentPlanSchema>;

export const updateInstallmentPlanSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  currency: z.string().trim().length(3).optional(),
  frequency: installmentFrequency.optional(),
  frequencyInterval: z.number().int().min(1).max(999).optional(),
  cardId: z.string().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateInstallmentPlan = z.infer<typeof updateInstallmentPlanSchema>;
