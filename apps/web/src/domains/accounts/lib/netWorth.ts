import type { accounts, debts } from "@finance/contracts";
import { subtractMoney, sumMoney } from "@finance/money";

import { leftAmount } from "../../debts/lib/debtMetrics";
import { accountAssets } from "./grouping";

/** Net worth in ONE currency: what it is made of and the result. */
export interface CurrencyNetWorth {
  currency: string;
  /** Money held (a credit card account holds none). */
  assets: string;
  /** Credit used on cards (positive figure, subtracted). */
  cardDebt: string;
  /** Pending person-to-person debts: owed to you minus what you owe. */
  debts: string;
  /** assets − cardDebt + debts. */
  net: string;
}

/**
 * THE net worth, shared by the Panel and Cuentas so both always show the same
 * number. One figure per currency and never converted (this app has no exchange
 * rate): the primary currency first, then the rest alphabetically.
 *
 * Per account it uses `accountAssets` (a credit card account's own balance is not
 * money held) and subtracts every account's `creditUsed`; per debt, only what is
 * still pending (`leftAmount`), with its sign.
 */
export function netWorthByCurrency(
  list: accounts.BankAccount[],
  debtList: debts.Debt[],
  primary: string,
): CurrencyNetWorth[] {
  const parts = new Map<string, { assets: string[]; cardDebt: string[]; debts: string[] }>();
  const bucket = (currency: string) => {
    const existing = parts.get(currency);
    if (existing) return existing;
    const created = { assets: [] as string[], cardDebt: [] as string[], debts: [] as string[] };
    parts.set(currency, created);
    return created;
  };
  for (const a of list) {
    bucket(a.currency).assets.push(accountAssets(a));
    bucket(a.currency).cardDebt.push(a.creditUsed);
  }
  for (const d of debtList) {
    if (d.settledAt !== null) continue;
    const left = leftAmount(d);
    bucket(d.currency).debts.push(d.direction === "YOU_OWE" ? subtractMoney("0", left) : left);
  }
  if (!parts.has(primary)) bucket(primary);

  return [...parts.entries()]
    .map(([currency, p]) => {
      const assets = sumMoney(p.assets);
      const cardDebt = sumMoney(p.cardDebt);
      const debtsNet = sumMoney(p.debts);
      return {
        currency,
        assets,
        cardDebt,
        debts: debtsNet,
        net: sumMoney([assets, subtractMoney("0", cardDebt), debtsNet]),
      };
    })
    .sort((a, b) =>
      a.currency === primary
        ? -1
        : b.currency === primary
          ? 1
          : a.currency.localeCompare(b.currency),
    );
}
