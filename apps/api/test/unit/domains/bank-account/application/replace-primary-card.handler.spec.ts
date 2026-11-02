import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import { MakePrimaryCardCommand } from "../../../../../src/domains/bank-account/application/commands/make-primary-card.command";
import { MakePrimaryCardHandler } from "../../../../../src/domains/bank-account/application/commands/make-primary-card.handler";
import { RemoveCardCommand } from "../../../../../src/domains/bank-account/application/commands/remove-card.command";
import { RemoveCardHandler } from "../../../../../src/domains/bank-account/application/commands/remove-card.handler";
import { ReplacePrimaryCardCommand } from "../../../../../src/domains/bank-account/application/commands/replace-primary-card.command";
import { ReplacePrimaryCardHandler } from "../../../../../src/domains/bank-account/application/commands/replace-primary-card.handler";
import {
  BankAccount,
  type CardProps,
} from "../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  CardNotPrimaryError,
  PrimaryCardHasHistoryError,
  PrimaryCardInvalidReplacementError,
  PrimaryCardReplacementRequiredError,
} from "../../../../../src/domains/bank-account/domain/errors";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeIdempotencyRecordRepo,
  fakePrismaTransaction,
  fakeTransactionSumsRepo,
} from "../../../support/fake-ports";

const card = (over: Partial<CardProps> = {}): CardProps => ({
  id: "p",
  name: "Visa",
  kind: "CREDIT",
  last4: "1111",
  expiryMonth: 6,
  expiryYear: 2031,
  isActive: true,
  isPrimary: false,
  isVirtual: false,
  isAdditional: false,
  cardholderName: null,
  network: null,
  limits: [],
  ...over,
});

function account(cards: CardProps[]): BankAccount {
  const base = accountAggregate({
    id: "acc_1",
    type: "CREDIT_CARD",
    creditLimit: "1000000",
  }).snapshot();
  return BankAccount.fromPersistence({ ...base, id: "acc_1", cards });
}

function deps(acc: BankAccount, history: { moved?: boolean; planned?: boolean } = {}) {
  const accountRepo = fakeBankAccountRepo({
    findById: vi.fn(async () => acc),
    findByIdForUpdateWithTx: vi.fn(async () => acc),
  });
  const movements = { existsForCard: vi.fn(async () => history.moved ?? false) };
  const plans = {
    existsForCard: vi.fn(async () => history.planned ?? false),
    list: vi.fn(async () => []),
  };
  const statements = { carriedOverOwed: vi.fn(async () => new Map()) };
  return { accountRepo, movements, plans, statements };
}

function replaceHandler(d: ReturnType<typeof deps>) {
  return new ReplacePrimaryCardHandler(
    { publish: vi.fn() } as never,
    fakeIdempotencyRecordRepo(),
    d.accountRepo,
    fakeTransactionSumsRepo({ existsForCard: d.movements.existsForCard }),
    d.plans as never,
    d.statements as never,
    fakePrismaTransaction() as never,
  );
}

const replace = (
  input: accounts.ReplacePrimaryCard,
  key = "key-0000000000000000000001",
  cardId = "p",
) => new ReplacePrimaryCardCommand("u1", "acc_1", cardId, input, key);

const newCard = {
  name: "Visa nueva",
  last4: "9999",
  expiryMonth: 4,
  expiryYear: 2032,
  isVirtual: false,
  isAdditional: false,
};

describe("ReplacePrimaryCardHandler (spec 039)", () => {
  it("DEACTIVATE with an existing card: it becomes primary, the old one inactive and additional", async () => {
    const acc = account([card({ id: "p", isPrimary: true }), card({ id: "a" })]);
    const d = deps(acc);
    const dto = await replaceHandler(d).execute(
      replace({ action: "DEACTIVATE", replacement: { cardId: "a" } }),
    );
    expect(d.accountRepo.saveCardRolesWithTx).toHaveBeenCalledTimes(1);
    expect(dto.cards.find((c) => c.id === "a")).toMatchObject({ isPrimary: true, isActive: true });
    expect(dto.cards.find((c) => c.id === "p")).toMatchObject({
      isPrimary: false,
      isActive: false,
    });
    expect(dto.creditLimit).toBe("1000000.0000");
  });

  it("DEACTIVATE with a new card creates exactly one, as an additional first, then primary", async () => {
    const acc = account([card({ id: "p", isPrimary: true })]);
    const d = deps(acc);
    const handler = replaceHandler(d);
    const cmd = replace({ action: "DEACTIVATE", replacement: { newCard } });
    const dto = await handler.execute(cmd);
    expect(d.accountRepo.addCardWithTx).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.accountRepo.addCardWithTx).mock.calls[0]![3]).toMatchObject({
      kind: "CREDIT",
      isPrimary: false,
      isActive: true,
      limits: [],
    });
    expect(dto.cards.find((c) => c.id === "new-card")).toMatchObject({ isPrimary: true });
    // A replay with the same key answers the first response and creates nothing more.
    await handler.execute(cmd);
    expect(d.accountRepo.addCardWithTx).toHaveBeenCalledTimes(1);
  });

  it("refuses a card that is no longer the primary", async () => {
    const acc = account([card({ id: "p" }), card({ id: "a", isPrimary: true })]);
    await expect(
      replaceHandler(deps(acc)).execute(
        replace({ action: "DEACTIVATE", replacement: { cardId: "a" } }),
      ),
    ).rejects.toBeInstanceOf(CardNotPrimaryError);
  });

  it("refuses the same card, an inactive one or one of another account as replacement", async () => {
    const acc = () =>
      account([card({ id: "p", isPrimary: true }), card({ id: "x", isActive: false })]);
    for (const cardId of ["p", "x", "01900000-0000-7000-8000-000000000009"]) {
      await expect(
        replaceHandler(deps(acc())).execute(
          replace({ action: "DEACTIVATE", replacement: { cardId } }, `key-${cardId}-000000000000`),
        ),
      ).rejects.toBeInstanceOf(PrimaryCardInvalidReplacementError);
    }
  });

  it("DELETE without history removes the card in the same transaction", async () => {
    const acc = account([card({ id: "p", isPrimary: true }), card({ id: "a" })]);
    const d = deps(acc);
    const dto = await replaceHandler(d).execute(
      replace({ action: "DELETE", replacement: { cardId: "a" } }),
    );
    expect(d.accountRepo.removeCardWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "acc_1",
      "p",
    );
    expect(dto.cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("DELETE is refused while the card has movements or instalment plans", async () => {
    for (const history of [{ moved: true }, { planned: true }]) {
      const acc = account([card({ id: "p", isPrimary: true }), card({ id: "a" })]);
      const d = deps(acc, history);
      await expect(
        replaceHandler(d).execute(replace({ action: "DELETE", replacement: { cardId: "a" } })),
      ).rejects.toBeInstanceOf(PrimaryCardHasHistoryError);
      expect(d.accountRepo.removeCardWithTx).not.toHaveBeenCalled();
    }
  });
});

describe("MakePrimaryCardHandler (spec 039)", () => {
  function makeHandler(d: ReturnType<typeof deps>) {
    return new MakePrimaryCardHandler(
      { publish: vi.fn() } as never,
      d.accountRepo,
      fakeTransactionSumsRepo(),
      d.plans as never,
      d.statements as never,
      fakePrismaTransaction() as never,
    );
  }

  it("swaps the roles and keeps both cards active", async () => {
    const acc = account([card({ id: "p", isPrimary: true }), card({ id: "a" })]);
    const d = deps(acc);
    const dto = await makeHandler(d).execute(new MakePrimaryCardCommand("u1", "acc_1", "a"));
    expect(dto.cards.find((c) => c.id === "a")).toMatchObject({ isPrimary: true, isActive: true });
    expect(dto.cards.find((c) => c.id === "p")).toMatchObject({ isPrimary: false, isActive: true });
  });

  it("repairs an account whose primary was deactivated before spec 039", async () => {
    const acc = account([card({ id: "p", isPrimary: true, isActive: false }), card({ id: "a" })]);
    const dto = await makeHandler(deps(acc)).execute(
      new MakePrimaryCardCommand("u1", "acc_1", "a"),
    );
    expect(dto.cards.find((c) => c.id === "a")?.isPrimary).toBe(true);
  });

  it("refuses an inactive card", async () => {
    const acc = account([card({ id: "p", isPrimary: true }), card({ id: "x", isActive: false })]);
    await expect(
      makeHandler(deps(acc)).execute(new MakePrimaryCardCommand("u1", "acc_1", "x")),
    ).rejects.toBeInstanceOf(PrimaryCardInvalidReplacementError);
  });
});

describe("RemoveCardHandler (spec 039)", () => {
  it("refuses deleting the primary through a plain delete", async () => {
    const acc = account([card({ id: "p", isPrimary: true }), card({ id: "a" })]);
    const d = deps(acc);
    const handler = new RemoveCardHandler({ publish: vi.fn() } as never, d.accountRepo);
    await expect(handler.execute(new RemoveCardCommand("u1", "acc_1", "p"))).rejects.toBeInstanceOf(
      PrimaryCardReplacementRequiredError,
    );
    expect(d.accountRepo.removeCard).not.toHaveBeenCalled();
  });
});
