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
    reconcile: useMutation({ mutationFn: accountsApi.reconcile, onSuccess: invalidate }),
    generateStatements: useMutation({
      mutationFn: accountsApi.generateStatements,
      onSuccess: (_, id) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", id, "credit-statements"] });
      },
    }),
    payCreditStatement: useMutation({
      mutationFn: (vars: { id: string; statementId: string; fromAccountId: string }) =>
        accountsApi.payCreditStatement(vars.id, vars.statementId, vars.fromAccountId),
      onSuccess: (_, vars) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
      },
    }),
    updateCreditStatement: useMutation({
      mutationFn: (vars: { id: string; statementId: string; amount: string }) =>
        accountsApi.updateCreditStatement(vars.id, vars.statementId, vars.amount),
      onSuccess: (_, vars) => {
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
      },
    }),
    remove: useMutation({ mutationFn: accountsApi.remove, onSuccess: invalidate }),
  };
}
