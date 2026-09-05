import { useMutation, useQueryClient } from "@tanstack/react-query";

import { debtsApi } from "../api/debtsApi";

export function useDebtMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["debts"] });
  // settle/register-payment/undo-payment/unsettle now move real money (see
  // CLAUDE.md's `debt` bullet): they also touch an account's balance and add/
  // remove a real `Transaction`, so their own views must refresh too.
  const invalidateMoney = () => {
    invalidate();
    void qc.invalidateQueries({ queryKey: ["accounts"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return {
    create: useMutation({ mutationFn: debtsApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof debtsApi.update>[1] }) =>
        debtsApi.update(id, body),
      onSuccess: invalidate,
    }),
    settle: useMutation({
      mutationFn: (vars: {
        id: string;
        idempotencyKey: string;
        body: Parameters<typeof debtsApi.settle>[2];
      }) => debtsApi.settle(vars.id, vars.idempotencyKey, vars.body),
      onSuccess: invalidateMoney,
    }),
    unsettle: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        debtsApi.unsettle(vars.id, vars.idempotencyKey),
      onSuccess: invalidateMoney,
    }),
    registerPayment: useMutation({
      mutationFn: (vars: {
        id: string;
        idempotencyKey: string;
        body: Parameters<typeof debtsApi.registerPayment>[2];
      }) => debtsApi.registerPayment(vars.id, vars.idempotencyKey, vars.body),
      onSuccess: invalidateMoney,
    }),
    undoPayment: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        debtsApi.undoPayment(vars.id, vars.idempotencyKey),
      onSuccess: invalidateMoney,
    }),
    remove: useMutation({ mutationFn: debtsApi.remove, onSuccess: invalidate }),
  };
}
