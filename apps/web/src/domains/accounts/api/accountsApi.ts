import type { accounts } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

function toQuery(filters?: accounts.AccountFilters): string {
  if (!filters?.status) return "";
  return `?status=${filters.status}`;
}

export const accountsApi = {
  list: (filters?: accounts.AccountFilters) =>
    apiFetch<accounts.BankAccount[]>(`/accounts${toQuery(filters)}`),

  get: (id: string) => apiFetch<accounts.BankAccount>(`/accounts/${id}`),

  create: (body: accounts.CreateBankAccount) =>
    apiFetch<accounts.BankAccount>("/accounts", { method: "POST", body: JSON.stringify(body) }),

  update: (id: string, body: accounts.UpdateBankAccount) =>
    apiFetch<accounts.BankAccount>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  setStatus: (id: string, status: accounts.AccountStatus) =>
    apiFetch<accounts.BankAccount>(`/accounts/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  creditStatements: (id: string) =>
    apiFetch<accounts.CreditStatement[]>(`/accounts/${id}/credit-statements`),

  generateStatements: (id: string) =>
    apiFetch<accounts.CreditStatement[]>(`/accounts/${id}/generate-statements`, { method: "POST" }),

  payCreditStatement: (id: string, statementId: string, body: accounts.PayCreditStatement) =>
    apiFetch<accounts.CreditStatement>(`/accounts/${id}/credit-statements/${statementId}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Reconcile a period against the movements dated inside it. */
  syncCreditStatement: (id: string, statementId: string) =>
    apiFetch<accounts.CreditStatement>(`/accounts/${id}/credit-statements/${statementId}/sync`, {
      method: "POST",
    }),

  remove: (id: string) => apiFetch<void>(`/accounts/${id}`, { method: "DELETE" }),
};
