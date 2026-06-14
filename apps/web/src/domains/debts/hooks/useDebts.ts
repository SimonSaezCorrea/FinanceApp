import { useQuery } from "@tanstack/react-query";

import { debtsApi } from "../api/debtsApi";

export function useDebts() {
  return useQuery({
    queryKey: ["debts"],
    queryFn: debtsApi.list,
  });
}
