import type { debts } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const debtsApi = {
  list: () => apiFetch<debts.Debt[]>("/debts"),

  create: (body: debts.CreateDebt) =>
    apiFetch<debts.Debt>("/debts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: debts.UpdateDebt) =>
    apiFetch<debts.Debt>(`/debts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  settle: (id: string) => apiFetch<void>(`/debts/${id}/settle`, { method: "POST" }),

  registerPayment: (id: string) =>
    apiFetch<debts.Debt>(`/debts/${id}/register-payment`, { method: "POST" }),

  remove: (id: string) => apiFetch<void>(`/debts/${id}`, { method: "DELETE" }),
};
