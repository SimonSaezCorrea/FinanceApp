import type { accounts } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const accountsApi = {
  list: () => apiFetch<accounts.BankAccount[]>("/accounts"),

  create: (body: accounts.CreateBankAccount) =>
    apiFetch<accounts.BankAccount>("/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: accounts.UpdateBankAccount) =>
    apiFetch<accounts.BankAccount>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/accounts/${id}`, { method: "DELETE" }),
};
