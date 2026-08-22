import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { installments } from "@finance/contracts";

import { installmentsApi } from "../api/installmentsApi";

export function useInstallmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["installments"] });
  /**
   * Paying or undoing moves three things at once — the plan, the paying account's
   * balance and a real movement — so all three caches go, not just this domain's.
   * The same reason a statement payment invalidates the same trio.
   */
  const invalidateMoney = () => {
    invalidate();
    void qc.invalidateQueries({ queryKey: ["accounts"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return {
    create: useMutation({ mutationFn: installmentsApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: Parameters<typeof installmentsApi.update>[1];
      }) => installmentsApi.update(id, body),
      onSuccess: invalidate,
    }),
    // Deleting reverses the plan's whole history — movements and balances included
    // (FR-050a) — so it invalidates the same trio a payment does.
    remove: useMutation({ mutationFn: installmentsApi.remove, onSuccess: invalidateMoney }),
    pay: useMutation({
      mutationFn: ({
        planId,
        sequence,
        body,
      }: {
        planId: string;
        sequence: number;
        body: installments.PayInstallment;
      }) => installmentsApi.pay(planId, sequence, body),
      onSuccess: invalidateMoney,
    }),
    unpay: useMutation({
      mutationFn: ({ planId, sequence }: { planId: string; sequence: number }) =>
        installmentsApi.unpay(planId, sequence),
      onSuccess: invalidateMoney,
    }),
  };
}
