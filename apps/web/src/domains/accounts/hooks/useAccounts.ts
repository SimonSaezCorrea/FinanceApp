import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

import { accountsApi } from "../api/accountsApi";

export function useAccounts(filters?: accounts.AccountFilters) {
  return useQuery({
    queryKey: ["accounts", filters ?? {}],
    queryFn: () => accountsApi.list(filters),
  });
}

/** What deleting `id` could take with it; only fetched while asking. */
export function useAccountDeletionImpact(id: string | null) {
  return useQuery({
    queryKey: ["accounts", id, "deletion-impact"],
    queryFn: () => accountsApi.deletionImpact(id!),
    enabled: id !== null,
    staleTime: 0,
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
      mutationFn: (vars: { id: string; body: accounts.GenerateStatement }) =>
        accountsApi.generateStatements(vars.id, vars.body),
      onSuccess: (_, { id }) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", id, "credit-statements"] });
      },
    }),
    updateStatementDates: useMutation({
      mutationFn: (vars: {
        id: string;
        statementId: string;
        body: accounts.UpdateStatementDates;
      }) => accountsApi.updateStatementDates(vars.id, vars.statementId, vars.body),
      // Moving a close re-links movements and instalments, so those lists move too.
      onSuccess: (_, { id }) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", id, "credit-statements"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["installments"] });
      },
    }),
    payCreditStatement: useMutation({
      mutationFn: (vars: {
        id: string;
        statementId: string;
        body: accounts.PayCreditStatement;
        idempotencyKey: string;
      }) =>
        accountsApi.payCreditStatement(vars.id, vars.statementId, vars.body, vars.idempotencyKey),
      onSuccess: (_, vars) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
      },
    }),
    prepayCreditStatement: useMutation({
      mutationFn: (vars: {
        id: string;
        statementId: string;
        body: accounts.PrepayCreditStatement;
        idempotencyKey: string;
      }) =>
        accountsApi.prepayCreditStatement(
          vars.id,
          vars.statementId,
          vars.body,
          vars.idempotencyKey,
        ),
      onSuccess: (_, vars) => {
        // Moves the credit pool AND creates a real movement on the source
        // account — the statements list alone is not enough.
        invalidate();
        qc.invalidateQueries({ queryKey: ["accounts", vars.id, "credit-statements"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
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
      mutationFn: (vars: { id: string; options?: accounts.RemoveAccount }) =>
        accountsApi.remove(vars.id, vars.options),
      onSuccess: (_, { id }) => {
        // Drop the deleted account's own entries BEFORE invalidating, or the
        // blanket `["accounts"]` invalidation refetches `["accounts", id]` and
        // the detail view flips to a 404 error state while it's still mounted.
        qc.removeQueries({ queryKey: ["accounts", id] });
        invalidate();
        // Whatever went with it (movements, plans, series, contributions) and the
        // debts it unlinked are other views' data.
        for (const key of ["transactions", "installments", "recurring", "savings", "debts"]) {
          qc.invalidateQueries({ queryKey: [key] });
        }
      },
    }),
  };
}
