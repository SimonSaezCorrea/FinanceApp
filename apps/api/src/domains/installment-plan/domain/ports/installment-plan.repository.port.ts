import type { installments } from "@finance/contracts";

import type { InstallmentPlan, PlannedPayment } from "../installment-plan.aggregate";

export const INSTALLMENT_PLAN_REPOSITORY = Symbol("INSTALLMENT_PLAN_REPOSITORY");

export type CreateInstallmentPlanPlan = {
  title: string;
  totalPrincipal: string;
  installmentCount: number;
  startDate: Date;
  currency: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  cardId: string | null;
  notes: string | null;
  payments: PlannedPayment[];
};

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface InstallmentPlanRepositoryPort {
  list(userId: string): Promise<InstallmentPlan[]>;
  findOne(userId: string, id: string): Promise<InstallmentPlan | null>;
  create(userId: string, plan: CreateInstallmentPlanPlan): Promise<InstallmentPlan>;
  /** Persists the plan's own scalar fields (title/currency/frequency/
   * frequencyInterval/notes) — never its payments (those are immutable once
   * scheduled; only their `paidAt` changes, via `setPaymentPaidAt`). */
  save(aggregate: InstallmentPlan): Promise<void>;
  /** Sets (or clears) one scheduled payment's `paidAt`, scoped to the plan
   * belonging to `userId` — mirrors the pre-migration repository's
   * `markPaid`/`markUnpaid` ownership-scoped `updateMany`. */
  setPaymentPaidAt(
    userId: string,
    planId: string,
    sequence: number,
    paidAt: Date | null,
  ): Promise<boolean>;
  remove(userId: string, id: string): Promise<boolean>;
}
