import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

import { cardsApi } from "../api/cardsApi";

/** Card mutations; invalidate the accounts cache so detail/list refresh. */
export function useCardMutations(accountId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });

  return {
    add: useMutation({
      mutationFn: (body: accounts.CreateCard) => cardsApi.add(accountId, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { cardId: string; body: accounts.CreateCard }) =>
        cardsApi.update(accountId, vars.cardId, vars.body),
      onSuccess: invalidate,
    }),
    load: useMutation({
      mutationFn: (vars: { cardId: string; body: accounts.LoadPrepaidCard }) =>
        cardsApi.load(accountId, vars.cardId, vars.body),
      onSuccess: () => {
        // A load moves the account's balance AND creates a movement, so the
        // movements cache is stale too — not just the account.
        invalidate();
        qc.invalidateQueries({ queryKey: ["transactions"] });
      },
    }),
    remove: useMutation({
      mutationFn: (cardId: string) => cardsApi.remove(accountId, cardId),
      onSuccess: invalidate,
    }),
  };
}
