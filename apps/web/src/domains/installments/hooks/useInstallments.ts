import { useQuery } from "@tanstack/react-query";

import { installmentsApi } from "../api/installmentsApi";

export function useInstallments() {
  return useQuery({
    queryKey: ["installments"],
    queryFn: installmentsApi.list,
  });
}

/**
 * One plan, fetched on demand. The list already has every plan, so this exists for
 * the ONE thing the list cannot carry: `deletionImpact`, which the delete
 * confirmation must declare before it acts (FR-050b).
 */
export function useInstallmentPlan(id: string | null) {
  return useQuery({
    queryKey: ["installments", id],
    queryFn: () => installmentsApi.get(id!),
    enabled: id !== null,
  });
}
