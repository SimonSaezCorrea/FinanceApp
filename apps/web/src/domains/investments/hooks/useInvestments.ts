import { useQuery } from "@tanstack/react-query";

import { investmentsApi } from "../api/investmentsApi";

export function useInvestments() {
  return useQuery({
    queryKey: ["investments"],
    queryFn: investmentsApi.list,
  });
}
