import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { movementTemplates } from "@finance/contracts";

import { movementTemplatesApi } from "../api/movementTemplatesApi";

export const MOVEMENT_TEMPLATES_KEY = ["movement-templates"] as const;

/** The person's templates, by name. */
export function useMovementTemplates(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: MOVEMENT_TEMPLATES_KEY,
    queryFn: movementTemplatesApi.list,
    enabled: options.enabled ?? true,
  });
}

/** Creating, replacing and deleting templates. No movement changes with them. */
export function useMovementTemplateMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: MOVEMENT_TEMPLATES_KEY });
  return {
    create: useMutation({
      mutationFn: (body: movementTemplates.SaveMovementTemplate) =>
        movementTemplatesApi.create(body),
      onSuccess: invalidate,
    }),
    replace: useMutation({
      mutationFn: (vars: { id: string; body: movementTemplates.SaveMovementTemplate }) =>
        movementTemplatesApi.replace(vars.id, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => movementTemplatesApi.remove(id),
      onSuccess: invalidate,
    }),
  };
}
