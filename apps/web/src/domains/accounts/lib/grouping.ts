import type { accounts } from "@finance/contracts";
import { subtractMoney, sumMoney } from "@finance/money";

/** How the accounts list is sectioned (the "Agrupar:" control). */
export type GroupBy = "currency" | "type" | "institution" | "status" | "none";

export const GROUP_BY_VALUES: GroupBy[] = ["currency", "type", "institution", "status", "none"];

/** A standalone credit card: it holds no money, only debt. */
function isCreditLine(a: accounts.BankAccount): boolean {
  return a.type === "CREDIT_LINE";
}

/** What the account adds to (or subtracts from) net worth, in its own currency. */
export function accountNet(a: accounts.BankAccount): string {
  return isCreditLine(a) ? `-${a.creditUsed}` : subtractMoney(a.currentBalance, a.creditUsed);
}

/** Money actually held (credit lines hold none). */
export function accountAssets(a: accounts.BankAccount): string {
  return isCreditLine(a) ? "0" : a.currentBalance;
}

/** One total per currency — the only honest aggregation without FX rates. */
export interface CurrencyTotal {
  currency: string;
  total: string;
}

function totalsByCurrency(
  list: accounts.BankAccount[],
  value: (a: accounts.BankAccount) => string,
): CurrencyTotal[] {
  const map = new Map<string, string[]>();
  for (const a of list) {
    const bucket = map.get(a.currency) ?? [];
    bucket.push(value(a));
    map.set(a.currency, bucket);
  }
  return [...map.entries()].map(([currency, vals]) => ({ currency, total: sumMoney(vals) }));
}

/** Net worth / assets / card debt of the whole list, split per currency (no FX conversion). */
export function accountsSummary(list: accounts.BankAccount[]): {
  net: CurrencyTotal[];
  assets: CurrencyTotal[];
  cardDebt: CurrencyTotal[];
} {
  return {
    net: totalsByCurrency(list, accountNet),
    assets: totalsByCurrency(list, accountAssets),
    cardDebt: totalsByCurrency(list, (a) => a.creditUsed),
  };
}

export interface AccountGroup {
  key: string;
  title: string;
  /** Net total per currency present in the group (one entry for single-currency groups). */
  totals: CurrencyTotal[];
  accounts: accounts.BankAccount[];
}

/** Labels the caller resolves through i18n (this module stays translation-free). */
export interface GroupLabels {
  /** The user's preferred currency — its group is always listed first. */
  primaryCurrency: string;
  type: (type: accounts.AccountType) => string;
  status: (status: accounts.AccountStatus) => string;
  noInstitution: string;
  ungrouped: string;
}

/**
 * Biggest first: accounts are ranked by their net contribution, so the money
 * lives at the top and credit debt (negative) sinks to the bottom. Amounts of
 * different currencies aren't convertible here, so within a mixed group the
 * comparison is on the raw number — good enough for an ordering hint.
 */
function byAmountDesc(a: accounts.BankAccount, b: accounts.BankAccount): number {
  return Number(accountNet(b)) - Number(accountNet(a));
}

/**
 * Sections the list by the chosen criterion. Groups are ranked by how many
 * accounts they hold (largest first) — except when grouping by currency, where
 * the user's primary currency always leads regardless of size. Accounts inside
 * each group go from the largest amount to the smallest.
 */
export function groupAccounts(
  list: accounts.BankAccount[],
  mode: GroupBy,
  labels: GroupLabels,
): AccountGroup[] {
  if (mode === "none") {
    return list.length === 0
      ? []
      : [
          {
            key: "all",
            title: labels.ungrouped,
            totals: totalsByCurrency(list, accountNet),
            accounts: [...list].sort(byAmountDesc),
          },
        ];
  }

  const keyOf = (a: accounts.BankAccount): string => {
    switch (mode) {
      case "currency":
        return a.currency;
      case "type":
        return labels.type(a.type);
      case "institution":
        return a.institutionName ?? a.institution ?? labels.noInstitution;
      case "status":
        return labels.status(a.status);
    }
  };

  const order: string[] = [];
  const bucket = new Map<string, accounts.BankAccount[]>();
  for (const a of list) {
    const key = keyOf(a);
    const existing = bucket.get(key);
    if (existing) existing.push(a);
    else {
      bucket.set(key, [a]);
      order.push(key);
    }
  }

  return order
    .map((key) => {
      const group = bucket.get(key) ?? [];
      return {
        key,
        title: key,
        totals: totalsByCurrency(group, accountNet),
        accounts: [...group].sort(byAmountDesc),
      };
    })
    .sort((a, b) => {
      if (mode === "currency") {
        // The primary currency leads even if it holds fewer accounts.
        if (a.key === labels.primaryCurrency) return -1;
        if (b.key === labels.primaryCurrency) return 1;
      }
      return b.accounts.length - a.accounts.length;
    });
}
