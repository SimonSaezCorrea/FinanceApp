import { useMutation, useQueryClient } from "@tanstack/react-query";

import { debtsApi } from "../api/debtsApi";

export function useDebtMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["debts"] });

  return {
    create: useMutation({ mutationFn: debtsApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof debtsApi.update>[1] }) =>
        debtsApi.update(id, body),
      onSuccess: invalidate,
    }),
    settle: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        debtsApi.settle(vars.id, vars.idempotencyKey),
      onSuccess: invalidate,
    }),
    unsettle: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        debtsApi.unsettle(vars.id, vars.idempotencyKey),
      onSuccess: invalidate,
    }),
    registerPayment: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        debtsApi.registerPayment(vars.id, vars.idempotencyKey),
      onSuccess: invalidate,
    }),
    undoPayment: useMutation({
      mutationFn: (vars: { id: string; idempotencyKey: string }) =>
        debtsApi.undoPayment(vars.id, vars.idempotencyKey),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: debtsApi.remove, onSuccess: invalidate }),
  };
}
