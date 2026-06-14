import type { installments } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const installmentsApi = {
  list: () => apiFetch<installments.InstallmentPlan[]>("/installments"),

  create: (body: installments.CreateInstallmentPlan) =>
    apiFetch<installments.InstallmentPlan>("/installments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  pay: (planId: string, sequence: number) =>
    apiFetch<void>(`/installments/${planId}/payments/${sequence}/pay`, { method: "POST" }),

  remove: (id: string) => apiFetch<void>(`/installments/${id}`, { method: "DELETE" }),
};
