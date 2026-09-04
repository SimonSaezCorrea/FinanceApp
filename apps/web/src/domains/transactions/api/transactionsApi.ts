import type { transactions } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

function toQuery(filters: transactions.TransactionFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.bankAccountId) params.set("bankAccountId", filters.bankAccountId);
  if (filters.cardId) params.set("cardId", filters.cardId);
  if (filters.creditStatementId) params.set("creditStatementId", filters.creditStatementId);
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

  create: (body: transactions.CreateTransaction, idempotencyKey: string) =>
    apiFetch<transactions.Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  update: (id: string, body: transactions.UpdateTransaction) =>
    apiFetch<transactions.Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/transactions/${id}`, { method: "DELETE" }),

  /** A transfer is created, read, edited and deleted as a PAIR (FR-015). */
  transfer: {
    get: (groupId: string) => apiFetch<transactions.Transfer>(`/transactions/transfers/${groupId}`),

    create: (body: transactions.CreateTransfer, idempotencyKey: string) =>
      apiFetch<transactions.Transfer>("/transactions/transfers", {
        method: "POST",
        body: JSON.stringify(body),
        idempotencyKey,
      }),

    update: (groupId: string, body: transactions.UpdateTransfer) =>
      apiFetch<transactions.Transfer>(`/transactions/transfers/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    remove: (groupId: string) =>
      apiFetch<void>(`/transactions/transfers/${groupId}`, { method: "DELETE" }),
  },

  attachments: {
    list: (transactionId: string) =>
      apiFetch<transactions.Attachment[]>(`/transactions/${transactionId}/attachments`),

    upload: (transactionId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      // No Content-Type header on purpose: the browser has to set the multipart
      // boundary itself.
      return apiFetch<transactions.Attachment>(`/transactions/${transactionId}/attachments`, {
        method: "POST",
        body: form,
      });
    },

    url: (transactionId: string, attachmentId: string) =>
      apiFetch<transactions.AttachmentUrl>(
        `/transactions/${transactionId}/attachments/${attachmentId}/url`,
      ),

    remove: (transactionId: string, attachmentId: string) =>
      apiFetch<void>(`/transactions/${transactionId}/attachments/${attachmentId}`, {
        method: "DELETE",
      }),
  },
};
