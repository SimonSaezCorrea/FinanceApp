import type { transactions } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

function toQuery(filters: transactions.TransactionFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.bankAccountId) params.set("bankAccountId", filters.bankAccountId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const transactionsApi = {
  list: (filters?: transactions.TransactionFilters) =>
    apiFetch<transactions.Transaction[]>(`/transactions${toQuery(filters)}`),

  create: (body: transactions.CreateTransaction) =>
    apiFetch<transactions.Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: transactions.UpdateTransaction) =>
    apiFetch<transactions.Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/transactions/${id}`, { method: "DELETE" }),
};
