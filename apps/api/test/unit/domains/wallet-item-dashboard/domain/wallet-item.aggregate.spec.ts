import { describe, expect, it } from "vitest";

import { WalletItem } from "../../../../../src/domains/wallet-item-dashboard/domain/wallet-item.aggregate";
import { WalletItemInvalidError } from "../../../../../src/domains/wallet-item-dashboard/domain/errors";

function makeItem(overrides: Partial<Parameters<typeof WalletItem.fromPersistence>[0]> = {}) {
  return WalletItem.fromPersistence({
    id: "w1",
    userId: "u1",
    accountId: null,
    cardId: "c1",
    order: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("WalletItem.planCreation", () => {
  it("plans a card pin", () => {
    const planned = WalletItem.planCreation({ cardId: "c1", order: 2 });
    expect(planned).toEqual({ accountId: null, cardId: "c1", order: 2 });
  });

  it("plans an account pin", () => {
    const planned = WalletItem.planCreation({ accountId: "a1", order: 0 });
    expect(planned).toEqual({ accountId: "a1", cardId: null, order: 0 });
  });

  it("rejects providing neither accountId nor cardId (XOR violation)", () => {
    expect(() => WalletItem.planCreation({ order: 0 })).toThrow(WalletItemInvalidError);
  });

  it("rejects providing both accountId and cardId (XOR violation)", () => {
    expect(() => WalletItem.planCreation({ accountId: "a1", cardId: "c1", order: 0 })).toThrow(
      WalletItemInvalidError,
    );
  });
});

describe("WalletItem.fromPersistence", () => {
  it("accepts a persisted account-only row", () => {
    const item = makeItem({ accountId: "a1", cardId: null });
    expect(item.accountId).toBe("a1");
    expect(item.cardId).toBeNull();
  });

  it("accepts a persisted card-only row", () => {
    const item = makeItem({ accountId: null, cardId: "c1" });
    expect(item.cardId).toBe("c1");
    expect(item.accountId).toBeNull();
  });

  it("rejects a persisted row violating the XOR invariant (both set)", () => {
    expect(() =>
      WalletItem.fromPersistence({
        id: "w1",
        userId: "u1",
        accountId: "a1",
        cardId: "c1",
        order: 0,
        createdAt: new Date(),
      }),
    ).toThrow(WalletItemInvalidError);
  });

  it("rejects a persisted row violating the XOR invariant (neither set)", () => {
    expect(() =>
      WalletItem.fromPersistence({
        id: "w1",
        userId: "u1",
        accountId: null,
        cardId: null,
        order: 0,
        createdAt: new Date(),
      }),
    ).toThrow(WalletItemInvalidError);
  });
});

describe("WalletItem.toContract", () => {
  it("maps dates as ISO", () => {
    const item = makeItem();
    expect(item.toContract()).toEqual({
      id: "w1",
      accountId: null,
      cardId: "c1",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
