import type { savings } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const savingsApi = {
  listGoals: () => apiFetch<savings.SavingsGoal[]>("/savings/goals"),

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

  listEntries: () => apiFetch<savings.SavingsEntry[]>("/savings/entries"),

  createEntry: (body: savings.CreateSavingsEntry) =>
    apiFetch<savings.SavingsEntry>("/savings/entries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
