import { describe, expect, it } from "vitest";
import type { accounts } from "@finance/contracts";
import { defaultCardId, selectableCards } from "./selectableCards";

const card = (id: string, over: Partial<accounts.Card> = {}) =>
  ({ id, kind: "CREDIT", isActive: true, isPrimary: false, ...over }) as accounts.Card;

describe("selectableCards", () => {
  it("leaves out deactivated cards", () => {
    const account = { cards: [card("a"), card("b", { isActive: false })] };
    expect(selectableCards(account).map((c) => c.id)).toEqual(["a"]);
  });

  it("keeps the card a movement already has, even deactivated", () => {
    const account = { cards: [card("a"), card("b", { isActive: false })] };
    expect(selectableCards(account, "b").map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("defaultCardId", () => {
  it("is the primary card while it is active", () => {
    const account = { cards: [card("a"), card("p", { isPrimary: true })] };
    expect(defaultCardId(account)).toBe("p");
  });

  it("falls back to the first active credit card when the primary is deactivated", () => {
    const account = {
      cards: [card("p", { isPrimary: true, isActive: false }), card("a"), card("b")],
    };
    expect(defaultCardId(account)).toBe("a");
  });

  it("is empty when no card is active", () => {
    expect(defaultCardId({ cards: [card("p", { isPrimary: true, isActive: false })] })).toBe("");
    expect(defaultCardId(undefined)).toBe("");
  });
});
