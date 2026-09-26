import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { imports } from "@finance/contracts";

import { importApi } from "../api/importApi";

/** Importing moves the account's balance and, on a credit card account, its pool
 * and open billing period — everything those feed is invalidated. */
export function useImportTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: imports.ImportTransactionsRequest; idempotencyKey: string }) =>
      importApi.transactions(vars.body, vars.idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
