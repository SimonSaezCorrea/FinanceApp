import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

import { cardsApi } from "../api/cardsApi";

/** Card mutations; invalidate the accounts cache so detail/list refresh. */
export function useCardMutations(accountId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });
  // Changing the primary card moves roles every movement row and the wallet tiles show.
  const invalidateRoles = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["wallet"] }),
    ]);

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
    remove: useMutation({
      mutationFn: (cardId: string) => cardsApi.remove(accountId, cardId),
      onSuccess: invalidate,
    }),
    makePrimary: useMutation({
      mutationFn: (cardId: string) => cardsApi.makePrimary(accountId, cardId),
      onSuccess: invalidateRoles,
    }),
    replacePrimary: useMutation({
      mutationFn: (vars: {
        cardId: string;
        body: accounts.ReplacePrimaryCard;
        idempotencyKey: string;
      }) => cardsApi.replacePrimary(accountId, vars.cardId, vars.body, vars.idempotencyKey),
      onSuccess: invalidateRoles,
    }),
  };
}
