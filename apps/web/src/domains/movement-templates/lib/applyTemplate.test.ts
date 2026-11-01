import { describe, expect, it } from "vitest";

import type { accounts, customFields, movementTemplates, reference } from "@finance/contracts";

import { emptyTransactionForm } from "../../transactions/lib/emptyForm";
import { applyTemplate, type ApplyTemplateContext } from "./applyTemplate";
import { templateFromForm } from "./templateFromForm";

const account = (
  id: string,
  type: accounts.AccountType,
  cards: Partial<accounts.Card>[] = [],
  currency = "CLP",
): accounts.BankAccount =>
  ({
    id,
    name: id,
    type,
    currency,
    status: "ACTIVE",
    cards: cards.map((c) => ({ id: "x", kind: "DEBIT", isPrimary: false, isActive: true, ...c })),
  }) as unknown as accounts.BankAccount;

const CHECKING = account("chk", "CHECKING", [{ id: "deb", kind: "DEBIT" }]);
const SIGHT = account("sight", "SIGHT");
const CREDIT = account("visa", "CREDIT_CARD", [
  { id: "primary", kind: "CREDIT", isPrimary: true },
  { id: "extra", kind: "CREDIT" },
]);
const CATEGORIES = [
  { id: "transport", code: "TRANSPORT", kind: "EXPENSE", isSystem: false },
  { id: "salary", code: "SALARY", kind: "INCOME", isSystem: false },
] as reference.Category[];
const FIELD = {
  id: "f1",
  name: "Transferido",
  type: "BOOLEAN",
  options: [],
  scope: { movementKinds: ["EXPENSE"], accountIds: [], cardKinds: [] },
  scopeBroken: false,
  defaultValue: false,
  showAsColumn: false,
  sortOrder: 0,
  valueCount: 0,
} as customFields.CustomField;

const template = (over: Partial<movementTemplates.MovementTemplate> = {}) =>
  ({
    id: "t1",
    name: "Bencina",
    type: "EXPENSE",
    amount: null,
    currency: null,
    bankAccountId: "chk",
    cardId: "deb",
    categoryId: "transport",
    recurringExpenseId: "rent",
    description: "Bencina",
    observation: null,
    emisor: null,
    receptor: null,
    lugar: "Copec",
    financeCharge: false,
    customFields: { f1: true },
    ...over,
  }) as movementTemplates.MovementTemplate;

const ctx = (over: Partial<ApplyTemplateContext> = {}): ApplyTemplateContext => ({
  accounts: [CHECKING, SIGHT, CREDIT],
  selectableIds: new Set(["chk", "sight", "visa"]),
  categories: CATEGORIES,
  recurringIds: new Set(["rent"]),
  fields: [FIELD],
  current: emptyTransactionForm("2026-10-25"),
  ...over,
});

describe("applyTemplate", () => {
  it("fills every field and keeps today's date", () => {
    const form = applyTemplate(template({ amount: "450000.0000", currency: "CLP" }), ctx());
    expect(form).toMatchObject({
      mode: "EXPENSE",
      amount: "450000",
      currency: "CLP",
      bankAccountId: "chk",
      cardId: "deb",
      categoryId: "transport",
      recurringExpenseId: "rent",
      description: "Bencina",
      lugar: "Copec",
      date: "2026-10-25",
      customFields: { f1: true },
    });
  });

  it("records the template's name when it has no description, only when used", () => {
    const noDescription = template({ name: "Café", description: null });
    expect(applyTemplate(noDescription, ctx()).description).toBe("Café");
    expect(applyTemplate(noDescription, ctx({ withDefaults: false })).description).toBe("");
  });

  it("leaves the amount empty for a 'monto libre' template", () => {
    expect(applyTemplate(template(), ctx()).amount).toBe("");
  });

  it("empties whatever no longer fits instead of failing", () => {
    const form = applyTemplate(
      template({
        categoryId: "gone",
        recurringExpenseId: "deleted",
        customFields: { gone: 1 as never },
      }),
      ctx({ selectableIds: new Set(["sight"]) }),
    );
    expect(form).toMatchObject({
      bankAccountId: "",
      cardId: "",
      categoryId: "",
      recurringExpenseId: "",
      // The applying default stays; the deleted field's value is dropped.
      customFields: { f1: false },
    });
  });

  it("drops a card that isn't on the chosen account, and a category of the other type", () => {
    const form = applyTemplate(
      template({ cardId: "extra", categoryId: "salary" }),
      ctx({ lockedAccountId: "sight" }),
    );
    expect(form.bankAccountId).toBe("sight");
    expect(form.cardId).toBe("");
    expect(form.categoryId).toBe("");
  });

  it("turns an income into an expense on a credit card account, with its primary card", () => {
    const form = applyTemplate(
      template({ type: "INCOME", bankAccountId: "visa", cardId: null, categoryId: null }),
      ctx(),
    );
    expect(form.mode).toBe("EXPENSE");
    expect(form.cardId).toBe("primary");
  });

  it("ignores a custom field value that its field no longer accepts or that doesn't apply", () => {
    const income = applyTemplate(
      template({ type: "INCOME", bankAccountId: "sight", cardId: null, categoryId: null }),
      ctx(),
    );
    expect(income.customFields).toEqual({});
    const changed = applyTemplate(template({ customFields: { f1: "texto" } }), ctx());
    expect(changed.customFields).toEqual({ f1: false });
  });
});

describe("templateFromForm", () => {
  const form = {
    ...emptyTransactionForm("2026-10-25"),
    mode: "EXPENSE" as const,
    amount: "12500",
    bankAccountId: "chk",
    cardId: "deb",
    categoryId: "transport",
    description: " Bencina ",
    lugar: "Copec",
  };
  const opts = {
    name: " Bencina ",
    keepAmount: false,
    accounts: [CHECKING, SIGHT, CREDIT],
    fields: [FIELD],
    fieldValues: { f1: true },
  };

  it("keeps everything but the date, the amount only when asked", () => {
    expect(templateFromForm(form, opts)).toEqual({
      name: "Bencina",
      type: "EXPENSE",
      bankAccountId: "chk",
      cardId: "deb",
      categoryId: "transport",
      recurringExpenseId: undefined,
      description: "Bencina",
      observation: undefined,
      emisor: undefined,
      receptor: undefined,
      lugar: "Copec",
      financeCharge: undefined,
      customFields: { f1: true },
    });
    expect(templateFromForm(form, { ...opts, keepAmount: true })).toMatchObject({
      amount: "12500",
      currency: "CLP",
    });
  });

  it("round-trips through applyTemplate", () => {
    const saved = templateFromForm(form, { ...opts, keepAmount: true });
    const back = applyTemplate(
      {
        ...template(),
        ...saved,
        amount: saved.amount ?? null,
        currency: saved.currency ?? null,
        recurringExpenseId: null,
        observation: null,
        emisor: null,
        receptor: null,
        financeCharge: false,
        customFields: saved.customFields ?? {},
      } as movementTemplates.MovementTemplate,
      ctx(),
    );
    expect(back).toMatchObject({ amount: "12500", cardId: "deb", description: "Bencina" });
  });

  it("never keeps a card on an income nor on an issuer charge", () => {
    expect(templateFromForm({ ...form, mode: "INCOME" }, opts).cardId).toBeUndefined();
    const charge = templateFromForm(
      { ...form, bankAccountId: "visa", cardId: "primary", financeCharge: true },
      opts,
    );
    expect(charge).toMatchObject({ financeCharge: true, cardId: undefined });
  });
});
