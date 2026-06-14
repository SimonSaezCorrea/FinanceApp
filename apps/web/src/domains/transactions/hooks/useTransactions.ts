import { useQuery } from "@tanstack/react-query";

import type { transactions } from "@finance/contracts";

import { transactionsApi } from "../api/transactionsApi";

export function useTransactions(filters?: transactions.TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters ?? {}],
    queryFn: () => transactionsApi.list(filters),
  });
}
