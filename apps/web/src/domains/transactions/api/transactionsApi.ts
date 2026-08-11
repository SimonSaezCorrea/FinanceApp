import type { transactions } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

function toQuery(filters: transactions.TransactionFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.bankAccountId) params.set("bankAccountId", filters.bankAccountId);
  if (filters.cardId) params.set("cardId", filters.cardId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.category) params.set("category", filters.category);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const transactionsApi = {
  /** One page when `filters.limit` is set, otherwise every match. */
  list: (filters?: transactions.TransactionFilters) =>
    apiFetch<transactions.TransactionPage>(`/transactions${toQuery(filters)}`),

  /** Totals/count/categories over the whole filtered set — see the contract. */
  summary: (filters?: transactions.TransactionFilters) =>
    apiFetch<transactions.TransactionSummary>(`/transactions/summary${toQuery(filters)}`),

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
