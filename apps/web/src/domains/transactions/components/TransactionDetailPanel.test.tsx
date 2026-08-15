import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import type { accounts, transactions } from "@finance/contracts";

import i18n from "../../../i18n";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { TransactionDetailPanel } from "./TransactionDetailPanel";

const tx = (over: Partial<transactions.Transaction> = {}): transactions.Transaction => ({
  id: "t1",
  type: "EXPENSE",
  amount: "1000.0000",
  currency: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
  category: "Comida",
  description: "Almuerzo",
  observation: null,
  emisor: null,
  receptor: null,
  lugar: null,
  bankAccountId: "a1",
  cardId: null,
  financeCharge: false,
  installmentPlanId: null,
  transferGroupId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const account = {
  id: "a1",
  name: "Cuenta corriente",
  type: "CHECKING",
  currency: "CLP",
  currentBalance: "10000",
  cards: [],
} as unknown as accounts.BankAccount;

function renderPanel(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("TransactionDetailPanel", () => {
  it("shows the amount with its sign and currency", () => {
    renderPanel(<TransactionDetailPanel transaction={tx()} accounts={[account]} />);
    expect(screen.getByText(/−/)).toBeDefined();
    const income = tx({ id: "t2", type: "INCOME" });
    renderPanel(<TransactionDetailPanel transaction={income} accounts={[account]} />);
    expect(screen.getByText(/\+/)).toBeDefined();
  });

  it("collapses the optional details into one sentence when all are empty", () => {
    renderPanel(<TransactionDetailPanel transaction={tx()} accounts={[account]} />);
    expect(screen.getByText(i18n.t("transactions.detail.noDetails"))).toBeDefined();
  });

  it("lists the optional details when there is data", () => {
    renderPanel(
      <TransactionDetailPanel transaction={tx({ lugar: "Santiago" })} accounts={[account]} />,
    );
    expect(screen.queryByText(i18n.t("transactions.detail.noDetails"))).toBeNull();
    expect(screen.getByText("Santiago")).toBeDefined();
  });

  it("shows an em dash — never a number — when the balance can't be computed", () => {
    renderPanel(
      <TransactionDetailPanel transaction={tx()} accounts={[account]} balanceAfter={null} />,
    );
    expect(screen.getByText(i18n.t("transactions.detail.balanceAfter"))).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
  });

  it("shows the balance row when it can", () => {
    renderPanel(
      <TransactionDetailPanel transaction={tx()} accounts={[account]} balanceAfter="9000" />,
    );
    expect(screen.getByText(i18n.t("transactions.detail.balanceAfter"))).toBeDefined();
  });
});

describe("TransactionDetailModal navigation", () => {
  const items = [tx(), tx({ id: "t2" }), tx({ id: "t3" })];

  it("disables ‹ on the first movement and › on the last", () => {
    renderPanel(
      <TransactionDetailModal
        transaction={items[0]!}
        accounts={[account]}
        open
        onOpenChange={() => {}}
        items={items}
        hasNextPage={false}
      />,
    );
    expect(screen.getByRole("button", { name: "previous" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "next" }).hasAttribute("disabled")).toBe(false);
  });

  it("disables › at the end of the whole set", () => {
    renderPanel(
      <TransactionDetailModal
        transaction={items[2]!}
        accounts={[account]}
        open
        onOpenChange={() => {}}
        items={items}
        hasNextPage={false}
      />,
    );
    expect(screen.getByRole("button", { name: "next" }).hasAttribute("disabled")).toBe(true);
  });
});
