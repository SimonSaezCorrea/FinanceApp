import type { accounts } from "@finance/contracts";

import { apiFetch } from "@finance/client";

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

  /** Spec 039: this active credit card becomes the account's primary. */
  makePrimary: (accountId: string, cardId: string) =>
    apiFetch<accounts.BankAccount>(`/accounts/${accountId}/cards/${cardId}/make-primary`, {
      method: "POST",
    }),

  /** Spec 039: deactivate or delete the primary card, naming the one that takes its place. */
  replacePrimary: (
    accountId: string,
    cardId: string,
    body: accounts.ReplacePrimaryCard,
    idempotencyKey: string,
  ) =>
    apiFetch<accounts.BankAccount>(`/accounts/${accountId}/cards/${cardId}/replace-primary`, {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),
};
