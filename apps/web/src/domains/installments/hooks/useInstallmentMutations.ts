import { useMutation, useQueryClient } from "@tanstack/react-query";

import { installmentsApi } from "../api/installmentsApi";

export function useInstallmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["installments"] });

  return {
    create: useMutation({ mutationFn: installmentsApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof installmentsApi.update>[1] }) =>
        installmentsApi.update(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: installmentsApi.remove, onSuccess: invalidate }),
  };
}
