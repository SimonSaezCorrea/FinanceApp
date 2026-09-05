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

  settle: (id: string, idempotencyKey: string, body: debts.PayDebt) =>
    apiFetch<void>(`/debts/${id}/settle`, {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify(body),
    }),

  unsettle: (id: string, idempotencyKey: string) =>
    apiFetch<debts.Debt>(`/debts/${id}/unsettle`, { method: "POST", idempotencyKey }),

  registerPayment: (id: string, idempotencyKey: string, body: debts.PayDebt) =>
    apiFetch<debts.Debt>(`/debts/${id}/register-payment`, {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify(body),
    }),

  undoPayment: (id: string, idempotencyKey: string) =>
    apiFetch<debts.Debt>(`/debts/${id}/undo-payment`, { method: "POST", idempotencyKey }),

  remove: (id: string) => apiFetch<void>(`/debts/${id}`, { method: "DELETE" }),
};
