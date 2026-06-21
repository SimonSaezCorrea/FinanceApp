import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { transactions } from "@finance/contracts";

import { transactionsApi } from "../api/transactionsApi";

/** Transaction mutations; invalidate transactions + accounts (balances depend on them). */
export function useTransactionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  return {
    create: useMutation({ mutationFn: transactionsApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (vars: { id: string; body: transactions.UpdateTransaction }) =>
        transactionsApi.update(vars.id, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: transactionsApi.remove, onSuccess: invalidate }),
  };
}
