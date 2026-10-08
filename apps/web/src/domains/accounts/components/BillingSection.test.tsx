import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import i18n from "../../../i18n";
import { accountsApi } from "../api/accountsApi";
import { BillingSection } from "./BillingSection";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { creditStatements: vi.fn() },
}));
// The panels opened from here have data needs of their own; this spec is about
// what the section itself lists.
vi.mock("../../transactions/components/TransactionCreateModal", () => ({
  TransactionCreateModal: () => null,
}));
vi.mock("./StatementDetailPanel", () => ({ StatementDetailPanel: () => null }));
// A marker standing for each panel: what these tests check is WHICH one a period's action opens.
vi.mock("./PayStatementPanel", () => ({
  PayStatementPanel: ({
    statement,
    intent,
  }: {
    statement: { id: string } | null;
    intent?: string;
  }) => (statement ? <div data-testid="pay-panel">{`${statement.id}:${intent ?? "pay"}`}</div> : null),
}));
vi.mock("./EditStatementPaymentPanel", () => ({
  EditStatementPaymentPanel: ({ statement }: { statement: { id: string } | null }) =>
    statement ? <div data-testid="edit-payment-panel">{statement.id}</div> : null,
}));

const account = { id: "a1", currency: "CLP", cards: [] } as unknown as accounts.BankAccount;

function statement(over: Partial<accounts.CreditStatement>): accounts.CreditStatement {
  return {
    id: "s1",
    accountId: "a1",
    status: "PENDING",
    periodStart: "2026-07-20T00:00:00.000Z",
    closedAt: "2026-08-20T00:00:00.000Z",
    paidAt: null,
    dueDate: null,
    nextClosingDate: null,
    amount: "120000",
    paidAmount: "0",
    carriedOverAmount: "0",
    prepaidAmount: "0",
    carriedToId: null,
    remainingAmount: "120000",
    minimumAmount: null,
    breakdown: { purchases: "120000", installments: "0", installmentCount: 0 },
    paidFromAccountId: null,
    paidTransactionId: null,
    currency: "CLP",
    transferredAt: null,
    transferredAmount: null,
    transferredToId: null,
    canTransfer: false,
    transferReversal: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...over,
  };
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <BillingSection account={account} />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const money = (v: string, currency: string) => formatMoney(v, { locale: i18n.language, currency });

describe("BillingSection — one tab per currency (spec 028)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows one window tab per currency, the account's own first and open", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([
      statement({ id: "clp" }),
      statement({ id: "usd", currency: "USD", amount: "30", remainingAmount: "30" }),
    ]);
    renderSection();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["CLP1", "USD1"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");

    // Only the selected currency's periods are on screen.
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByText(money("120000", "CLP")).length).toBeGreaterThan(0);
    expect(screen.queryByText(money("30", "USD"))).toBeNull();

    fireEvent.click(tabs[1]!);
    expect(screen.getAllByRole("tab")[1]!.getAttribute("aria-selected")).toBe("true");
    expect(
      within(screen.getByRole("tabpanel")).getAllByText(money("30", "USD")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(money("120000", "CLP"))).toBeNull();
    // Never summed into one figure.
    expect(screen.queryByText(money("120030", "CLP"))).toBeNull();
  });

  it("with a single currency there are no tabs at all", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([statement({ id: "clp" })]);
    renderSection();
    await waitFor(() =>
      expect(screen.getAllByText(money("120000", "CLP")).length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("BillingSection — the open period is a row of its own", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the open period first, beside a pending statement", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([
      statement({ id: "pending" }),
      statement({
        id: "open",
        status: "OPEN",
        periodStart: "2026-08-21T04:00:00.000Z",
        closedAt: null,
        amount: "107000",
        remainingAmount: "107000",
      }),
    ]);
    renderSection();
    const badges = await screen.findAllByText(
      new RegExp(
        `^(${i18n.t("accounts.detail.billingStatusValue.OPEN")}|${i18n.t(
          "accounts.detail.billingStatusValue.PENDING",
        )})$`,
      ),
    );
    expect(badges.map((b) => b.textContent)).toEqual([
      i18n.t("accounts.detail.billingStatusValue.OPEN"),
      i18n.t("accounts.detail.billingStatusValue.PENDING"),
    ]);
    expect(screen.getAllByText(money("107000", "CLP")).length).toBeGreaterThan(0);
  });
});

describe("BillingSection — periods in another currency can be settled (spec 030)", () => {
  beforeEach(() => vi.clearAllMocks());

  async function openUsdTab() {
    renderSection();
    const tabs = await screen.findAllByRole("tab");
    fireEvent.click(tabs[1]!);
  }

  const usd = (over: Partial<accounts.CreditStatement>) =>
    statement({
      id: "usd",
      currency: "USD",
      amount: "50.41",
      remainingAmount: "50.41",
      breakdown: { purchases: "50.41", installments: "0", installmentCount: 0 },
      ...over,
    });

  it("a closed USD period offers Pagar, which opens the payment panel for that period", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([statement({ id: "clp" }), usd({})]);
    await openUsdTab();

    fireEvent.click(
      within(screen.getByRole("tabpanel")).getAllByRole("button", {
        name: i18n.t("accounts.actions.payCredit"),
      })[0]!,
    );

    expect(screen.getByTestId("pay-panel").textContent).toBe("usd:pay");
  });

  it("the OPEN USD period offers Prepagar, which opens the same panel as a prepayment", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([
      statement({ id: "clp" }),
      usd({ id: "usd-open", status: "OPEN", closedAt: null, dueDate: null }),
    ]);
    await openUsdTab();

    fireEvent.click(
      within(screen.getByRole("tabpanel")).getAllByRole("button", {
        name: i18n.t("transactions.type.PREPAY"),
      })[0]!,
    );

    expect(screen.getByTestId("pay-panel").textContent).toBe("usd-open:prepay");
  });

  it("a USD period settled for less than its total can have its payment corrected", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([
      statement({ id: "clp" }),
      usd({
        id: "usd-short",
        status: "PARTIALLY_PAID",
        paidAt: "2026-09-01T00:00:00.000Z",
        paidAmount: "30",
        remainingAmount: "0",
      }),
    ]);
    await openUsdTab();

    fireEvent.click(
      within(screen.getByRole("tabpanel")).getAllByRole("button", {
        name: i18n.t("accounts.actions.editStatementPayment"),
      })[0]!,
    );

    expect(screen.getByTestId("edit-payment-panel").textContent).toBe("usd-short");
  });

  it("the account-currency periods behave as before: a closed CLP period still opens the payment panel", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([statement({ id: "clp" })]);
    renderSection();

    fireEvent.click(
      (
        await screen.findAllByRole("button", { name: i18n.t("accounts.actions.payCredit") })
      )[0]!,
    );

    expect(screen.getByTestId("pay-panel").textContent).toBe("clp:pay");
  });
});
