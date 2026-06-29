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
    settle: useMutation({ mutationFn: debtsApi.settle, onSuccess: invalidate }),
    registerPayment: useMutation({ mutationFn: debtsApi.registerPayment, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: debtsApi.remove, onSuccess: invalidate }),
  };
}
