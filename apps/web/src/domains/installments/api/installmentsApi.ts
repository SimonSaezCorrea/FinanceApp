import type { installments } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const installmentsApi = {
  list: () => apiFetch<installments.InstallmentPlan[]>("/installments"),

  /** The detail response — the only one carrying `deletionImpact` (FR-050b). */
  get: (id: string) => apiFetch<installments.InstallmentPlan>(`/installments/${id}`),

  /** Money-moving writes carry the attempt's `Idempotency-Key` (specs/015): the
   * API refuses them without one (`IDEMPOTENCY_KEY_REQUIRED`). */
  create: (body: installments.CreateInstallmentPlan, idempotencyKey: string) =>
    apiFetch<installments.InstallmentPlan>("/installments", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  pay: (
    planId: string,
    sequence: number,
    body: installments.PayInstallment,
    idempotencyKey: string,
  ) =>
    apiFetch<void>(`/installments/${planId}/payments/${sequence}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  unpay: (planId: string, sequence: number) =>
    apiFetch<void>(`/installments/${planId}/payments/${sequence}/unpay`, { method: "POST" }),

  update: (id: string, body: installments.UpdateInstallmentPlan) =>
    apiFetch<installments.InstallmentPlan>(`/installments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/installments/${id}`, { method: "DELETE" }),
};
