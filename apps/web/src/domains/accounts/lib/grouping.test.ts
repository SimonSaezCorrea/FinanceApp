import { describe, expect, it } from "vitest";

import type { accounts } from "@finance/contracts";

import { accountNet, accountsSummary, groupAccounts, type GroupLabels } from "./grouping";

const LABELS: GroupLabels = {
  type: (t) => `type:${t}`,
  status: (s) => `status:${s}`,
  primaryCurrency: "CLP",
  noInstitution: "none",
  ungrouped: "all",
};

function account(over: Partial<accounts.BankAccount>): accounts.BankAccount {
  return {
    id: "a1",
    name: "Account",
    type: "CHECKING",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: null,
    accountAlias: null,
    initialBalance: "0",
    overdraftLimit: "0",
    balanceCeiling: null,
    currentBalance: "0",
    creditLimit: "0",
    creditUsed: "0",
    creditPools: [],
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    minimumPaymentPercent: null,
    balanceSeries: [],
    balanceChangePct: null,
    cards: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("accountNet", () => {
  it("subtracts the used credit pool from a money-holding account", () => {
    expect(accountNet(account({ currentBalance: "1000", creditUsed: "300" }))).toBe("700.0000");
  });

  it("is pure debt for a standalone credit line", () => {
    expect(accountNet(account({ type: "CREDIT_CARD", creditUsed: "500" }))).toBe("-500");
  });
});

describe("accountsSummary", () => {
  it("splits net / assets / debt per currency instead of converting", () => {
    const { net, assets, cardDebt } = accountsSummary([
      account({ id: "a", currentBalance: "1000", creditUsed: "200" }),
      account({ id: "b", type: "CREDIT_CARD", creditUsed: "500" }),
      account({ id: "c", currency: "USD", currentBalance: "40" }),
    ]);
    expect(net).toEqual([
      { currency: "CLP", total: "300.0000" },
      { currency: "USD", total: "40.0000" },
    ]);
    expect(assets.find((x) => x.currency === "CLP")?.total).toBe("1000.0000");
    expect(cardDebt.find((x) => x.currency === "CLP")?.total).toBe("700.0000");
  });
});

describe("groupAccounts", () => {
  const list = [
    account({ id: "a", currency: "CLP", institutionName: "Banco de Chile" }),
    account({ id: "b", currency: "USD" }),
    account({ id: "c", currency: "CLP", type: "CASH" }),
  ];

  it("groups by currency preserving arrival order", () => {
    const groups = groupAccounts(list, "currency", LABELS);
    expect(groups.map((g) => g.key)).toEqual(["CLP", "USD"]);
    expect(groups[0]?.accounts.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("orders accounts inside a group from the largest amount to the smallest", () => {
    const groups = groupAccounts(
      [
        account({ id: "small", currentBalance: "100" }),
        account({ id: "debt", type: "CREDIT_CARD", creditUsed: "500" }),
        account({ id: "big", currentBalance: "9000" }),
      ],
      "currency",
      LABELS,
    );
    expect(groups[0]?.accounts.map((a) => a.id)).toEqual(["big", "small", "debt"]);
  });

  it("falls back to a placeholder when the institution is unknown", () => {
    // Groups are ranked by size, so the two institution-less accounts lead.
    expect(groupAccounts(list, "institution", LABELS).map((g) => g.key)).toEqual([
      "none",
      "Banco de Chile",
    ]);
  });

  it("puts the primary currency first even when a foreign group is bigger", () => {
    const groups = groupAccounts(
      [
        account({ id: "u1", currency: "USD" }),
        account({ id: "u2", currency: "USD" }),
        account({ id: "c1", currency: "CLP" }),
      ],
      "currency",
      LABELS,
    );
    expect(groups.map((g) => g.key)).toEqual(["CLP", "USD"]);
  });

  it("ranks the remaining groups by how many accounts they hold", () => {
    const groups = groupAccounts(
      [
        account({ id: "e1", currency: "EUR" }),
        account({ id: "u1", currency: "USD" }),
        account({ id: "u2", currency: "USD" }),
      ],
      "currency",
      LABELS,
    );
    expect(groups.map((g) => g.key)).toEqual(["USD", "EUR"]);
  });

  it("returns a single section with a per-currency total when ungrouped", () => {
    const groups = groupAccounts(list, "none", LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.totals.map((x) => x.currency)).toEqual(["CLP", "USD"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupAccounts([], "none", LABELS)).toEqual([]);
  });
});
