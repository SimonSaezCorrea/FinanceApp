import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("./PayStatementPanel", () => ({ PayStatementPanel: () => null }));
vi.mock("./EditStatementPaymentPanel", () => ({ EditStatementPaymentPanel: () => null }));

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

describe("BillingSection — one block per currency (spec 028)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the CLP and the USD statement in their own blocks, each in its currency", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([
      statement({ id: "clp" }),
      statement({ id: "usd", currency: "USD", amount: "30", remainingAmount: "30" }),
    ]);
    renderSection();

    const usdHeading = await screen.findByText(
      i18n.t("accounts.detail.billingCurrencyGroup", { currency: "USD" }),
    );
    const clpHeading = screen.getByText(
      i18n.t("accounts.detail.billingCurrencyGroup", { currency: "CLP" }),
    );
    // CLP (the account's own) comes first.
    expect(
      clpHeading.compareDocumentPosition(usdHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const usdBlock = usdHeading.closest("section")!;
    const clpBlock = clpHeading.closest("section")!;
    expect(within(usdBlock).getByText(money("30", "USD"))).toBeDefined();
    expect(within(clpBlock).getByText(money("120000", "CLP"))).toBeDefined();
    // Never summed into one figure.
    expect(screen.queryByText(money("120030", "CLP"))).toBeNull();
  });

  it("with a single currency there is no per-currency heading at all", async () => {
    vi.mocked(accountsApi.creditStatements).mockResolvedValue([statement({ id: "clp" })]);
    renderSection();
    await waitFor(() =>
      expect(screen.getAllByText(money("120000", "CLP")).length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByText(i18n.t("accounts.detail.billingCurrencyGroup", { currency: "CLP" })),
    ).toBeNull();
  });
});
