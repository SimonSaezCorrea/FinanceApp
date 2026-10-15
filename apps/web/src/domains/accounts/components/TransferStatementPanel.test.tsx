import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import { localDay } from "../../exchange-rates/lib/day";
import { accountsApi } from "../api/accountsApi";
import { TransferStatementPanel } from "./TransferStatementPanel";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { list: vi.fn(), transferCreditStatement: vi.fn() },
}));
vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: vi.fn() },
}));
vi.mock("../../reference/api/referenceApi", () => ({
  referenceApi: {
    currencies: vi.fn(async () => [
      { id: "1", code: "CLP", numeric: "152", name: "Peso chileno", symbol: "$" },
      { id: "2", code: "USD", numeric: "840", name: "Dólar", symbol: "US$" },
    ]),
  },
}));

const CREDIT = {
  id: "acc_credit",
  type: "CREDIT_CARD",
  currency: "CLP",
  cards: [],
} as unknown as accounts.BankAccount;

const overdue = {
  id: "st_usd",
  accountId: "acc_credit",
  status: "PENDING",
  currency: "USD",
  periodStart: "2026-08-21T00:00:00.000Z",
  closedAt: "2026-09-17T23:59:59.999Z",
  dueDate: "2026-09-30T23:59:59.999Z",
  paidAt: null,
  amount: "50.0000",
  paidAmount: "0",
  remainingAmount: "50.0000",
  canTransfer: true,
} as unknown as accounts.CreditStatement;

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <TransferStatementPanel account={CREDIT} statement={overdue} onOpenChange={() => {}} />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("TransferStatementPanel (spec 028 US3)", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.clearAllMocks();
    vi.mocked(accountsApi.transferCreditStatement).mockResolvedValue(overdue);
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [{ currency: "USD", date: localDay(), value: "940", valueDate: localDay() }],
      latest: { USD: null, CLF: null },
    });
  });

  it("suggests the pesos from today's rate, takes what the bank charged, and sends it", async () => {
    renderPanel();
    const label = i18n.t("accounts.transfer.amountLabel", { currency: "CLP" });
    const input = (await screen.findByLabelText(label)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("47.000"));

    fireEvent.change(input, { target: { value: "47.350" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("accounts.transfer.submit") }));

    await waitFor(() => expect(accountsApi.transferCreditStatement).toHaveBeenCalled());
    const [accountId, statementId, body] = vi.mocked(accountsApi.transferCreditStatement).mock
      .calls[0]!;
    expect([accountId, statementId, body]).toEqual(["acc_credit", "st_usd", { amount: "47350" }]);
  });
});
