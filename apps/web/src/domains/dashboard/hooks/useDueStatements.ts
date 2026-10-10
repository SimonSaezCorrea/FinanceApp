import { useQueries } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

import { accountsApi } from "../../accounts/api/accountsApi";
import type { DueStatement } from "../lib/metrics";

/**
 * Billing periods of every active credit card account, flattened with the account they belong
 * to — what the Panel's "requiere atención" reads to say a statement is due. Same query key as
 * `useCreditStatements`, so the account's own billing screen and the Panel share one cache.
 * `loading` while any account's periods haven't arrived the first time, so the Panel doesn't say
 * "nothing is due" before it knows.
 */
export function useDueStatements(accountList: accounts.BankAccount[]): {
  items: DueStatement[];
  loading: boolean;
} {
  const cards = accountList.filter((a) => a.type === "CREDIT_CARD" && a.status === "ACTIVE");
  const results = useQueries({
    queries: cards.map((a) => ({
      queryKey: ["accounts", a.id, "credit-statements"],
      queryFn: () => accountsApi.creditStatements(a.id),
    })),
  });

  const items = cards.flatMap((account, i) =>
    (results[i]?.data ?? []).map((statement) => ({
      accountId: account.id,
      accountName: account.name,
      statement,
    })),
  );
  return { items, loading: results.some((r) => r.isLoading) };
}
