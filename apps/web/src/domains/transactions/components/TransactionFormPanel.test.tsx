import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { TransactionFormPanel, type TransactionFormValue } from "./TransactionFormPanel";

vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: () =>
      Promise.resolve({
        id: "u1",
        email: "a@b.com",
        name: "Ana",
        preferredCurrency: "CLP",
        extraCurrencies: [],
        locale: "es",
        theme: "dark",
        memberSinceYear: 2024,
        hideBalances: false,
      }),
    logout: vi.fn(),
  },
}));

// The global category catalogue: one of each shape the picker must tell apart.
const CATEGORIES = [
  { id: "cat-super", code: "SUPERMARKET", kind: "EXPENSE", isSystem: false, sortOrder: 10 },
  { id: "cat-salary", code: "SALARY", kind: "INCOME", isSystem: false, sortOrder: 20 },
  { id: "cat-other", code: "OTHER", kind: "BOTH", isSystem: false, sortOrder: 30 },
  { id: "cat-savings", code: "SAVINGS", kind: "BOTH", isSystem: true, sortOrder: 40 },
];
vi.mock("../../reference/api/referenceApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../reference/api/referenceApi")>();
  return {
    referenceApi: { ...original.referenceApi, categories: () => Promise.resolve(CATEGORIES) },
  };
});

const account = (over: Partial<accounts.BankAccount> = {}): accounts.BankAccount =>
  ({
    id: "a1",
    name: "Corriente",
    type: "CHECKING",
    status: "ACTIVE",
    currency: "CLP",
    currentBalance: "10000",
    creditLimit: "0",
    creditUsed: "0",
    cards: [],
    ...over,
  }) as unknown as accounts.BankAccount;

const initialValue: TransactionFormValue = {
  mode: "EXPENSE",
  amount: "1000",
  currency: "CLP",
  bankAccountId: "a1",
  toBankAccountId: "",
  amountIn: "",
  prepayFromAccountId: "",
  cardId: "",
  financeCharge: false,
  categoryId: "",
  recurringExpenseId: "",
  description: "",
  observation: "",
  emisor: "",
  receptor: "",
  lugar: "",
  date: "2026-08-01",
};

function Harness({
  accounts: list,
  editing = false,
  start = initialValue,
}: {
  accounts: accounts.BankAccount[];
  editing?: boolean;
  start?: TransactionFormValue;
}) {
  const [value, setValue] = useState(start);
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <TransactionFormPanel
            value={value}
            onChange={(p) => setValue((v) => ({ ...v, ...p }))}
            accounts={list}
            selectable={list}
            editing={editing}
          />
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

// The logged-in user resolves asynchronously (AuthProvider's own effect) —
// every render must wait for it before the assertions/interactions below.
async function renderHarness(props: Parameters<typeof Harness>[0]) {
  render(<Harness {...props} />);
  await waitFor(() =>
    expect(screen.getByLabelText(i18n.t("transactions.form.amount"))).toBeDefined(),
  );
}

describe("TransactionFormPanel", () => {
  it("shows the projected balance for the selected account", async () => {
    await renderHarness({ accounts: [account()] });
    expect(screen.getByText(i18n.t("transactions.form.projectedBalance"))).toBeDefined();
  });

  it("picking another account switches the currency", async () => {
    const other = account({ id: "a2", name: "Dólares", currency: "USD" });
    await renderHarness({ accounts: [account(), other] });
    // The account picker is the app's own panel, not a native <select>: open it
    // and choose, the way the user does.
    fireEvent.click(screen.getByLabelText(i18n.t("transactions.form.account")));
    fireEvent.click(screen.getByRole("button", { name: /Dólares/ }));
    expect(screen.getByLabelText(i18n.t("transactions.form.amount"))).toBeDefined();
    // The amount's currency label comes from the account now.
    expect(screen.getByText("USD")).toBeDefined();
  });

  it("shows the category icon beside the value and in every option", async () => {
    await renderHarness({
      accounts: [account()],
      start: { ...initialValue, categoryId: "cat-super" },
    });
    await screen.findByText(i18n.t("categories.SUPERMARKET"));

    const field = screen.getByLabelText(i18n.t("transactions.form.category"));
    // The adornment sits inside the control, next to the value — not adrift at
    // the far side of the row.
    const control = field.closest("div")!;
    expect(control.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2); // icon + chevron

    // A `SearchableSelect`, not a free-text `Combobox`: its panel opens on
    // click, not on focus.
    fireEvent.click(field);
    const option = screen.getByRole("button", { name: new RegExp(i18n.t("categories.OTHER")) });
    expect(option.querySelector("svg")).not.toBeNull();
  });

  it("offers only the catalogue categories that fit the type — never a system one", async () => {
    await renderHarness({ accounts: [account()] });
    fireEvent.click(screen.getByLabelText(i18n.t("transactions.form.category")));
    await screen.findByRole("button", { name: new RegExp(i18n.t("categories.SUPERMARKET")) });
    expect(
      screen.getByRole("button", { name: new RegExp(i18n.t("categories.OTHER")) }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: new RegExp(i18n.t("categories.SALARY")) }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: new RegExp(i18n.t("categories.SAVINGS")) }),
    ).toBeNull();
  });

  it("switching to income drops an expense-only category", async () => {
    await renderHarness({
      accounts: [account()],
      start: { ...initialValue, categoryId: "cat-super" },
    });
    await screen.findByText(i18n.t("categories.SUPERMARKET"));
    fireEvent.click(screen.getByText(i18n.t("transactions.type.INCOME")));
    expect(screen.queryByText(i18n.t("categories.SUPERMARKET"))).toBeNull();
  });

  it("switching to income drops the card field", async () => {
    const withCard = account({
      cards: [{ id: "c1", last4: "1234", name: "Visa" }],
    } as unknown as Partial<accounts.BankAccount>);
    await renderHarness({ accounts: [withCard] });
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).not.toBeNull();
    fireEvent.click(screen.getByText(i18n.t("transactions.type.INCOME")));
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).toBeNull();
  });
});

// FR-011 — rules the redesign must not break.
describe("TransactionFormPanel card rules", () => {
  it("a CASH account never offers a card", async () => {
    await renderHarness({ accounts: [account({ type: "CASH" })] });
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).toBeNull();
  });

  it("a non-cardable account (INVESTMENT) never offers a card", async () => {
    await renderHarness({ accounts: [account({ type: "INVESTMENT" })] });
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).toBeNull();
  });

  it("a CREDIT_CARD expense with no cards explains why it can't be saved", async () => {
    await renderHarness({ accounts: [account({ type: "CREDIT_CARD", cards: [] })] });
    expect(screen.getByText(i18n.t("transactions.form.noCardsHint"))).toBeDefined();
  });

  it("a CREDIT_CARD projects the AVAILABLE CREDIT, not a balance", async () => {
    // Money spent on a credit line doesn't leave a balance, it eats the limit.
    await renderHarness({
      accounts: [account({ type: "CREDIT_CARD", creditLimit: "500000", creditUsed: "100000" })],
    });
    expect(screen.getByText(i18n.t("transactions.form.projectedCredit"))).toBeDefined();
    expect(screen.queryByText(i18n.t("transactions.form.projectedBalance"))).toBeNull();
  });
});
