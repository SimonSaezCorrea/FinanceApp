import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { recurring } from "@finance/contracts";

import { recurringApi } from "../api/recurringApi";

export function useRecurring() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: recurringApi.list,
  });
}

/** Mutations that invalidate the recurring cache on success. */
export function useRecurringMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["recurring"] });

  return {
    create: useMutation({ mutationFn: recurringApi.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (vars: { id: string; body: recurring.UpdateRecurringExpense }) =>
        recurringApi.update(vars.id, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: recurringApi.remove, onSuccess: invalidate }),
  };
}
