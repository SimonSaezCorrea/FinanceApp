import type { recurring } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const recurringApi = {
  list: () => apiFetch<recurring.RecurringExpense[]>("/recurring"),

  get: (id: string) => apiFetch<recurring.RecurringExpense>(`/recurring/${id}`),

  create: (body: recurring.CreateRecurringExpense) =>
    apiFetch<recurring.RecurringExpense>("/recurring", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: recurring.UpdateRecurringExpense) =>
    apiFetch<recurring.RecurringExpense>(`/recurring/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/recurring/${id}`, { method: "DELETE" }),
};
