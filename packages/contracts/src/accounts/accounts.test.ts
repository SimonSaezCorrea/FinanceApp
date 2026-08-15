import { describe, expect, it } from "vitest";

import {
  allowedCardKinds,
  createBankAccountSchema,
  isCardKindAllowed,
  isCardableAccountType,
  type AccountType,
  type CardKind,
} from "./index";

/** Every (account type, card kind) pair that the app accepts. Anything not listed
 * here must be rejected — the matrix is what keeps the three products apart. */
const VALID_PAIRS: Array<[AccountType, CardKind]> = [
  ["CHECKING", "DEBIT"],
  ["SAVINGS", "DEBIT"],
  ["SIGHT", "DEBIT"],
  ["CREDIT_LINE", "CREDIT"],
  ["PREPAID", "PREPAID"],
];

const ALL_TYPES: AccountType[] = [
  "CHECKING",
  "SIGHT",
  "SAVINGS",
  "INVESTMENT",
  "CREDIT_LINE",
  "PREPAID",
  "CASH",
];
const ALL_KINDS: CardKind[] = ["CREDIT", "DEBIT", "PREPAID"];

describe("card kind ↔ account type matrix", () => {
  it.each(VALID_PAIRS)("allows a %s card on a %s account", (type, kind) => {
    expect(isCardKindAllowed(type, kind)).toBe(true);
  });

  it("rejects every pair that is not explicitly allowed", () => {
    const invalid = ALL_TYPES.flatMap((type) =>
      ALL_KINDS.filter((kind) => !VALID_PAIRS.some(([t, k]) => t === type && k === kind)).map(
        (kind) => [type, kind] as const,
      ),
    );
    for (const [type, kind] of invalid) {
      expect(isCardKindAllowed(type, kind)).toBe(false);
    }
  });

  it("keeps a prepaid card off a bank account and a debit card off a prepaid one", () => {
    expect(isCardKindAllowed("CHECKING", "PREPAID")).toBe(false);
    expect(isCardKindAllowed("PREPAID", "DEBIT")).toBe(false);
    expect(isCardKindAllowed("PREPAID", "CREDIT")).toBe(false);
  });

  it("keeps a credit card off a cash account: it is its own credit-line account", () => {
    // A credit card doesn't spend the checking balance — it opens a debt with its
    // own statement and cycle. The two products are never merged.
    expect(isCardKindAllowed("CHECKING", "CREDIT")).toBe(false);
    expect(isCardKindAllowed("SIGHT", "CREDIT")).toBe(false);
    expect(isCardKindAllowed("SAVINGS", "CREDIT")).toBe(false);
  });

  it("gives a savings account its ATM debit card", () => {
    expect(allowedCardKinds("SAVINGS")).toEqual(["DEBIT"]);
  });

  it("treats an empty kind list as 'this account carries no cards'", () => {
    for (const type of ["INVESTMENT", "CASH"] as AccountType[]) {
      expect(allowedCardKinds(type)).toEqual([]);
      expect(isCardableAccountType(type)).toBe(false);
    }
    expect(isCardableAccountType("PREPAID")).toBe(true);
    expect(isCardableAccountType("SAVINGS")).toBe(true);
  });
});

describe("createBankAccountSchema — prepaid account", () => {
  const base = {
    name: "Tenpo Prepago",
    type: "PREPAID" as const,
    currency: "CLP",
    accountNumber: "TP-1234",
  };

  it("accepts a prepaid account with an account number and a positive balance", () => {
    const parsed = createBankAccountSchema.parse({ ...base, initialBalance: "50000" });
    expect(parsed.type).toBe("PREPAID");
  });

  it("requires an account number (it is funded by transferring to it)", () => {
    const result = createBankAccountSchema.safeParse({ ...base, accountNumber: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a negative initial balance", () => {
    const result = createBankAccountSchema.safeParse({ ...base, initialBalance: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects credit and billing settings", () => {
    expect(createBankAccountSchema.safeParse({ ...base, creditLimit: "100000" }).success).toBe(
      false,
    );
    expect(createBankAccountSchema.safeParse({ ...base, billingCycleDay: 5 }).success).toBe(false);
    expect(createBankAccountSchema.safeParse({ ...base, minimumPaymentPercent: "5" }).success).toBe(
      false,
    );
  });

  it("allows a zero credit limit (the default a form may send)", () => {
    expect(createBankAccountSchema.safeParse({ ...base, creditLimit: "0" }).success).toBe(true);
  });

  it("applies the card matrix to inline cards[]", () => {
    const card = {
      name: "Prepago",
      last4: "4321",
      expiryMonth: 3,
      expiryYear: 2030,
    };
    expect(
      createBankAccountSchema.safeParse({ ...base, cards: [{ ...card, kind: "PREPAID" }] }).success,
    ).toBe(true);
    expect(
      createBankAccountSchema.safeParse({ ...base, cards: [{ ...card, kind: "DEBIT" }] }).success,
    ).toBe(false);
    expect(
      createBankAccountSchema.safeParse({
        name: "Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "001",
        cards: [{ ...card, kind: "PREPAID" }],
      }).success,
    ).toBe(false);
  });
});
