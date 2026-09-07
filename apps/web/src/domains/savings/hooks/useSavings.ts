import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { savings } from "@finance/contracts";

import { savingsApi } from "../api/savingsApi";

export function useSavingsGoals() {
  return useQuery({
    queryKey: ["savings", "goals"],
    queryFn: savingsApi.listGoals,
  });
}

export function useSavingsEntries() {
  return useQuery({
    queryKey: ["savings", "entries"],
    queryFn: savingsApi.listEntries,
  });
}

export function useSavingsSummary() {
  return useQuery({
    queryKey: ["savings", "summary"],
    queryFn: savingsApi.summary,
  });
}

/**
 * Aportes/cierres/reaperturas mueven dinero real (ver CLAUDE.md's
 * `savings-goal`/`savings-entry` bullet): tocan el saldo de una cuenta y
 * crean/borran un `Transaction` real, así que `accounts`/`transactions`
 * también deben refrescarse — mismo patrón que `useDebtMutations`.
 */
export function useSavingsMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["savings"] });
  const invalidateMoney = () => {
    invalidate();
    void qc.invalidateQueries({ queryKey: ["accounts"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return {
    createGoal: useMutation({ mutationFn: savingsApi.createGoal, onSuccess: invalidate }),
    updateGoal: useMutation({
      mutationFn: ({ id, body }: { id: string; body: savings.UpdateSavingsGoal }) =>
        savingsApi.updateGoal(id, body),
      onSuccess: invalidate,
    }),
    removeGoal: useMutation({ mutationFn: savingsApi.removeGoal, onSuccess: invalidate }),
    closeGoal: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string; body: savings.CloseSavingsGoal }) =>
        savingsApi.closeGoal(vars.id, vars.idempotencyKey, vars.body),
      onSuccess: invalidateMoney,
    }),
    reopenGoal: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        savingsApi.reopenGoal(vars.id, vars.idempotencyKey),
      onSuccess: invalidateMoney,
    }),
    createEntry: useMutation({
      mutationFn: (vars: { body: savings.CreateSavingsEntry; idempotencyKey: string }) =>
        savingsApi.createEntry(vars.body, vars.idempotencyKey),
      onSuccess: invalidateMoney,
    }),
    updateEntry: useMutation({
      mutationFn: (vars: {
        id: string;
        body: savings.UpdateSavingsEntry;
        idempotencyKey: string;
      }) => savingsApi.updateEntry(vars.id, vars.body, vars.idempotencyKey),
      onSuccess: invalidateMoney,
    }),
    removeEntry: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        savingsApi.removeEntry(vars.id, vars.idempotencyKey),
      onSuccess: invalidateMoney,
    }),
  };
}
