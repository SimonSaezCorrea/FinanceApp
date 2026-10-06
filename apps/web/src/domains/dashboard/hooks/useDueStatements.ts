import { useQueries } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

import { accountsApi } from "../../accounts/api/accountsApi";
import type { DueStatement } from "../lib/metrics";

/**
 * Billing periods of every active credit card account, flattened with the account they belong
 * to — what the Panel's "requiere atención" reads to say a statement is due. Same query key as
 * `useCreditStatements`, so the account's own billing screen and the Panel share one cache.
 */
export function useDueStatements(accountList: accounts.BankAccount[]): DueStatement[] {
  const cards = accountList.filter((a) => a.type === "CREDIT_CARD" && a.status === "ACTIVE");
  const results = useQueries({
    queries: cards.map((a) => ({
      queryKey: ["accounts", a.id, "credit-statements"],
      queryFn: () => accountsApi.creditStatements(a.id),
    })),
  });

  return cards.flatMap((account, i) =>
    (results[i]?.data ?? []).map((statement) => ({
      accountId: account.id,
      accountName: account.name,
      statement,
    })),
  );
}
