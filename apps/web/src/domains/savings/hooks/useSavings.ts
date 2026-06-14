import { useQuery } from "@tanstack/react-query";

import { savingsApi } from "../api/savingsApi";

export function useSavingsGoals() {
  return useQuery({
    queryKey: ["savings", "goals"],
    queryFn: savingsApi.listGoals,
  });
}
