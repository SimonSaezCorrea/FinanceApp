import { describe, expect, it } from "vitest";

import type { accounts, wallet } from "@finance/contracts";

import {
  accountKey,
  cardKey,
  draftFrom,
  duplicatedBalances,
  move,
  toReplaceBody,
  toggle,
} from "./walletDraft";

const account = (id: string, cards: Partial<accounts.Card>[] = []): accounts.BankAccount =>
  ({
    id,
    name: id,
    cards: cards.map((c) => ({ id: "x", kind: "DEBIT", last4: "0000", ...c })),
  }) as unknown as accounts.BankAccount;

describe("walletDraft", () => {
  it("starts from the saved wallet in its order", () => {
    const items = [
      { id: "1", accountId: null, cardId: "c1", order: 1, createdAt: "" },
      { id: "2", accountId: "a1", cardId: null, order: 0, createdAt: "" },
    ] as wallet.WalletItem[];
    expect(draftFrom(items)).toEqual(["a:a1", "c:c1"]);
  });

  it("toggles, appending new picks and refusing a fifth", () => {
    let d = toggle([], accountKey("a1"));
    d = toggle(d, cardKey("c1"));
    expect(d).toEqual(["a:a1", "c:c1"]);
    expect(toggle(d, accountKey("a1"))).toEqual(["c:c1"]);
    const full = ["a:1", "a:2", "a:3", "a:4"] as const;
    expect(toggle([...full], accountKey("5"))).toEqual(full);
  });

  it("moves an entry one place, never past the ends", () => {
    const d = [accountKey("a"), accountKey("b"), accountKey("c")];
    expect(move(d, accountKey("b"), -1)).toEqual(["a:b", "a:a", "a:c"]);
    expect(move(d, accountKey("a"), -1)).toEqual(d);
    expect(move(d, accountKey("c"), 1)).toEqual(d);
  });

  it("builds the replace body", () => {
    expect(toReplaceBody([cardKey("c1"), accountKey("a1")])).toEqual({
      items: [{ cardId: "c1" }, { accountId: "a1" }],
    });
  });

  it("flags a debit card pinned next to its own account, never a credit one", () => {
    const list = [
      account("bci", [
        { id: "d1", kind: "DEBIT", last4: "2705" },
        { id: "k1", kind: "CREDIT", last4: "7758" },
      ]),
    ];
    const dup = duplicatedBalances([accountKey("bci"), cardKey("d1"), cardKey("k1")], list);
    expect(dup.map((d) => d.card.last4)).toEqual(["2705"]);
    expect(duplicatedBalances([cardKey("d1")], list)).toEqual([]);
  });
});
