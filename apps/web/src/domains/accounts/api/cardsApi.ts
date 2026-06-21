import type { accounts } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

/** Cards are a sub-resource of an account. Payloads carry only last4 (never the full PAN). */
export const cardsApi = {
  add: (accountId: string, body: accounts.CreateCard) =>
    apiFetch<accounts.Card>(`/accounts/${accountId}/cards`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (accountId: string, cardId: string, body: accounts.CreateCard) =>
    apiFetch<accounts.Card>(`/accounts/${accountId}/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (accountId: string, cardId: string) =>
    apiFetch<void>(`/accounts/${accountId}/cards/${cardId}`, { method: "DELETE" }),
};

/** Extract the last 4 digits from a typed card number; the full PAN never leaves here. */
export function deriveLast4(input: string): string {
  return input.replace(/\D/g, "").slice(-4);
}
