import { useQuery } from "@tanstack/react-query";

import { installmentsApi } from "../api/installmentsApi";

export function useInstallments() {
  return useQuery({
    queryKey: ["installments"],
    queryFn: installmentsApi.list,
  });
}
