import { describe, expect, it, vi } from "vitest";

import {
  assertAccountEffectsLocked,
  incrementBalanceCheckedWithTx,
} from "../../../../../src/domains/transaction/application/account-limits";
import type { LockedAccountLimitsRow } from "../../../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import { MovementPolicy } from "../../../../../src/domains/transaction/domain/movement-policy";

const row = (o: Partial<LockedAccountLimitsRow> = {}): LockedAccountLimitsRow => ({
  type: "CHECKING",
  currentBalance: "1000",
  overdraftLimit: "0",
  balanceCeiling: null,
  creditLimit: "0",
  creditUsed: "0",
  ...o,
});

describe("MovementPolicy.assertNetEffect (security run-3)", () => {
  it("keeps a prepaid account at or above zero", () => {
    expect(() =>
      MovementPolicy.assertNetEffect(row({ type: "PREPAID" }), { cash: "-1000", pool: "0" }),
    ).not.toThrow();
    expect(() =>
      MovementPolicy.assertNetEffect(row({ type: "PREPAID" }), { cash: "-1000.01", pool: "0" }),
    ).toThrow(/PREPAID_INSUFFICIENT_BALANCE/);
  });

  it("applies an overdraft line only when one is declared", () => {
    expect(() =>
      MovementPolicy.assertNetEffect(row({ overdraftLimit: "500" }), { cash: "-1500", pool: "0" }),
    ).not.toThrow();
    expect(() =>
      MovementPolicy.assertNetEffect(row({ overdraftLimit: "500" }), { cash: "-1501", pool: "0" }),
    ).toThrow(/OVERDRAFT_LIMIT_EXCEEDED/);
    expect(() => MovementPolicy.assertNetEffect(row(), { cash: "-5000", pool: "0" })).not.toThrow();
  });

  it("caps an income at a declared ceiling", () => {
    expect(() =>
      MovementPolicy.assertNetEffect(row({ balanceCeiling: "1500" }), { cash: "501", pool: "0" }),
    ).toThrow(/BALANCE_CEILING_EXCEEDED/);
  });

  it("caps the pool at the credit limit", () => {
    const card = row({ type: "CREDIT_CARD", creditLimit: "1000", creditUsed: "900" });
    expect(() => MovementPolicy.assertNetEffect(card, { cash: "0", pool: "100" })).not.toThrow();
    expect(() => MovementPolicy.assertNetEffect(card, { cash: "0", pool: "101" })).toThrow(
      /CARD_LIMIT_EXCEEDED/,
    );
  });

  it("never refuses a change in the safe direction, even on an account already past a limit", () => {
    const negativePrepaid = row({ type: "PREPAID", currentBalance: "-50" });
    expect(() =>
      MovementPolicy.assertNetEffect(negativePrepaid, { cash: "10", pool: "0" }),
    ).not.toThrow();
    const overPool = row({ type: "CREDIT_CARD", creditLimit: "100", creditUsed: "500" });
    expect(() =>
      MovementPolicy.assertNetEffect(overPool, { cash: "0", pool: "-10" }),
    ).not.toThrow();
  });
});

describe("assertAccountEffectsLocked", () => {
  it("adds up the effects per account, locks them once, and checks the net change", async () => {
    const lockLimitsWithTx = vi.fn(
      async () => new Map([["a1", row({ type: "PREPAID", currentBalance: "100" })]]),
    );
    // -150 out and +100 back on the same account nets to -50: allowed.
    await assertAccountEffectsLocked({ lockLimitsWithTx }, {}, "u1", [
      { accountId: "a1", cash: "-150" },
      { accountId: "a1", cash: "100" },
      { accountId: null, cash: "-999" },
    ]);
    expect(lockLimitsWithTx).toHaveBeenCalledWith({}, "u1", ["a1"]);
  });

  it("checked increment refuses before writing", async () => {
    const accounts = {
      lockLimitsWithTx: vi.fn(
        async () => new Map([["a1", row({ type: "PREPAID", currentBalance: "10" })]]),
      ),
      incrementBalanceWithTx: vi.fn(),
    };
    await expect(incrementBalanceCheckedWithTx(accounts, {}, "u1", "a1", "-11")).rejects.toThrow(
      /PREPAID_INSUFFICIENT_BALANCE/,
    );
    expect(accounts.incrementBalanceWithTx).not.toHaveBeenCalled();
  });
});
