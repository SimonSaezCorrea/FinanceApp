import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { TransactionFormPanel, type TransactionFormValue } from "./TransactionFormPanel";

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
  cardId: "",
  category: "",
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
  return (
    <I18nextProvider i18n={i18n}>
      <TransactionFormPanel
        value={value}
        onChange={(p) => setValue((v) => ({ ...v, ...p }))}
        accounts={list}
        selectable={list}
        categoryOptions={["Comida", "Transporte"]}
        editing={editing}
      />
    </I18nextProvider>
  );
}

describe("TransactionFormPanel", () => {
  it("shows the projected balance for the selected account", () => {
    render(<Harness accounts={[account()]} />);
    expect(screen.getByText(i18n.t("transactions.form.projectedBalance"))).toBeDefined();
  });

  it("picking another account switches the currency", () => {
    const other = account({ id: "a2", name: "Dólares", currency: "USD" });
    render(<Harness accounts={[account(), other]} />);
    // The account picker is the app's own panel, not a native <select>: open it
    // and choose, the way the user does.
    fireEvent.click(screen.getByLabelText(i18n.t("transactions.form.account")));
    fireEvent.click(screen.getByRole("button", { name: "Dólares" }));
    expect(screen.getByLabelText(i18n.t("transactions.form.amount"))).toBeDefined();
    // The amount's currency label comes from the account now.
    expect(screen.getByText("USD")).toBeDefined();
  });

  it("shows the category icon beside the value and in every option", () => {
    render(<Harness accounts={[account()]} start={{ ...initialValue, category: "Comida" }} />);

    const field = screen.getByLabelText(i18n.t("transactions.form.category"));
    // The adornment sits inside the control, next to the value — not adrift at
    // the far side of the row.
    const control = field.closest("div")!;
    expect(control.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2); // icon + chevron

    fireEvent.focus(field);
    const option = screen.getByRole("button", { name: /Comida/ });
    expect(option.querySelector("svg")).not.toBeNull();
  });

  it("switching to income drops the card field", () => {
    const withCard = account({
      cards: [{ id: "c1", last4: "1234", name: "Visa" }],
    } as unknown as Partial<accounts.BankAccount>);
    render(<Harness accounts={[withCard]} />);
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).not.toBeNull();
    fireEvent.click(screen.getByText(i18n.t("transactions.type.INCOME")));
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).toBeNull();
  });
});

// FR-011 — rules the redesign must not break.
describe("TransactionFormPanel card rules", () => {
  it("a CASH account never offers a card", () => {
    render(<Harness accounts={[account({ type: "CASH" })]} />);
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).toBeNull();
  });

  it("a non-cardable account (INVESTMENT) never offers a card", () => {
    render(<Harness accounts={[account({ type: "INVESTMENT" })]} />);
    expect(screen.queryByLabelText(i18n.t("transactions.form.card"))).toBeNull();
  });

  it("a CREDIT_LINE expense with no cards explains why it can't be saved", () => {
    render(<Harness accounts={[account({ type: "CREDIT_LINE", cards: [] })]} />);
    expect(screen.getByText(i18n.t("transactions.form.noCardsHint"))).toBeDefined();
  });

  it("a CREDIT_LINE projects the AVAILABLE CREDIT, not a balance", () => {
    // Money spent on a credit line doesn't leave a balance, it eats the limit.
    render(
      <Harness
        accounts={[account({ type: "CREDIT_LINE", creditLimit: "500000", creditUsed: "100000" })]}
      />,
    );
    expect(screen.getByText(i18n.t("transactions.form.projectedCredit"))).toBeDefined();
    expect(screen.queryByText(i18n.t("transactions.form.projectedBalance"))).toBeNull();
  });
});
