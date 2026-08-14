import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

import { accountsApi } from "../api/accountsApi";

export function useAccounts(filters?: accounts.AccountFilters) {
  return useQuery({
    queryKey: ["accounts", filters ?? {}],
    queryFn: () => accountsApi.list(filters),
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: ["accounts", id],
    queryFn: () => accountsApi.get(id),
  });
}

export function useCreditStatements(id: string) {
  return useQuery({
    queryKey: ["accounts", id, "credit-statements"],
    queryFn: () => accountsApi.creditStatements(id),
    enabled: !!id,
  });
}

/** Mutations that invalidate the accounts cache on success. */
export function useAccountMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });

  return {
    create: useMutation({ mutationFn: accountsApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (vars: { id: string; body: accounts.UpdateBankAccount }) =>
        accountsApi.update(vars.id, vars.body),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (vars: { id: string; status: accounts.AccountStatus }) =>
        accountsApi.setStatus(vars.id, vars.status),
      onSuccess: invalidate,
    }),
    generateStatements: useMutation({
      mutationFn: accountsApi.generateStatements,
      onSuccess: (_, id) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", id, "credit-statements"] });
      },
    }),
    payCreditStatement: useMutation({
      mutationFn: (vars: { id: string; statementId: string; body: accounts.PayCreditStatement }) =>
        accountsApi.payCreditStatement(vars.id, vars.statementId, vars.body),
      onSuccess: (_, vars) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
      },
    }),
    updateStatementPayment: useMutation({
      mutationFn: (vars: { id: string; statementId: string; amount: string }) =>
        accountsApi.updateStatementPayment(vars.id, vars.statementId, vars.amount),
      onSuccess: (_, vars) => {
        // Moves the credit pool, the payment movement AND the source account's
        // balance, so the statements list alone is not enough.
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
      },
    }),
    syncStatement: useMutation({
      mutationFn: (vars: { id: string; statementId: string }) =>
        accountsApi.syncCreditStatement(vars.id, vars.statementId),
      onSuccess: (_, vars) => {
        // A sync can move the account's own credit pool and a payment movement,
        // so it isn't enough to refresh the statements list.
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
      },
    }),
    remove: useMutation({
      mutationFn: accountsApi.remove,
      onSuccess: (_, id) => {
        // Drop the deleted account's own entries BEFORE invalidating, or the
        // blanket `["accounts"]` invalidation refetches `["accounts", id]` and
        // the detail view flips to a 404 error state while it's still mounted.
        qc.removeQueries({ queryKey: ["accounts", id] });
        invalidate();
      },
    }),
  };
}
