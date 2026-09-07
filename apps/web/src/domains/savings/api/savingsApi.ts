import type { savings } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const savingsApi = {
  listGoals: () => apiFetch<savings.SavingsGoal[]>("/savings/goals"),
  getGoal: (id: string) => apiFetch<savings.SavingsGoal>(`/savings/goals/${id}`),
  summary: () => apiFetch<savings.SavingsSummary>("/savings/summary"),

  createGoal: (body: savings.CreateSavingsGoal) =>
    apiFetch<savings.SavingsGoal>("/savings/goals", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateGoal: (id: string, body: savings.UpdateSavingsGoal) =>
    apiFetch<savings.SavingsGoal>(`/savings/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  removeGoal: (id: string) => apiFetch<void>(`/savings/goals/${id}`, { method: "DELETE" }),

  closeGoal: (id: string, idempotencyKey: string, body: savings.CloseSavingsGoal) =>
    apiFetch<savings.SavingsGoal>(`/savings/goals/${id}/close`, {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify(body),
    }),

  reopenGoal: (id: string, idempotencyKey: string) =>
    apiFetch<savings.SavingsGoal>(`/savings/goals/${id}/reopen`, {
      method: "POST",
      idempotencyKey,
    }),

  listEntries: () => apiFetch<savings.SavingsEntry[]>("/savings/entries"),

  createEntry: (body: savings.CreateSavingsEntry, idempotencyKey: string) =>
    apiFetch<savings.SavingsEntry>("/savings/entries", {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify(body),
    }),

  updateEntry: (id: string, body: savings.UpdateSavingsEntry, idempotencyKey: string) =>
    apiFetch<savings.SavingsEntry>(`/savings/entries/${id}`, {
      method: "PATCH",
      idempotencyKey,
      body: JSON.stringify(body),
    }),

  removeEntry: (id: string, idempotencyKey: string) =>
    apiFetch<void>(`/savings/entries/${id}`, { method: "DELETE", idempotencyKey }),
};
