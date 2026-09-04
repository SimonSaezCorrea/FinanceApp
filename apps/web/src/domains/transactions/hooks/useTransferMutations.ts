import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { transactions } from "@finance/contracts";

import { transactionsApi } from "../api/transactionsApi";

/**
 * Transfer mutations. A transfer moves two accounts' balances and adds two rows
 * to the list, so accounts, movements AND the summary all have to be refetched
 * — the summary because its "N movimientos" counts both legs (its totals
 * deliberately don't, see `EXCLUDE_TRANSFERS`).
 */
export function useTransferMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  return {
    create: useMutation({
      mutationFn: (vars: { body: transactions.CreateTransfer; idempotencyKey: string }) =>
        transactionsApi.transfer.create(vars.body, vars.idempotencyKey),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { groupId: string; body: transactions.UpdateTransfer }) =>
        transactionsApi.transfer.update(vars.groupId, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: transactionsApi.transfer.remove,
      onSuccess: invalidate,
    }),
  };
}
