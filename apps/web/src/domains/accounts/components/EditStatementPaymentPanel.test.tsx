import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import { accountsApi } from "../api/accountsApi";
import { EditStatementPaymentPanel } from "./EditStatementPaymentPanel";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { list: vi.fn(), updateStatementPayment: vi.fn() },
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

const account = (over: Record<string, unknown>) =>
  ({ id: "a", currency: "CLP", cards: [], ...over }) as unknown as accounts.BankAccount;

const CREDIT = account({ id: "acc_credit", type: "CREDIT_CARD" });
const SOURCE_CLP = account({
  id: "acc_clp",
  type: "CHECKING",
  currency: "CLP",
  name: "Cuenta CLP",
});
const SOURCE_USD = account({
  id: "acc_usd",
  type: "CHECKING",
  currency: "USD",
  name: "Cuenta USD",
});

function statement(over: Record<string, unknown> = {}): accounts.CreditStatement {
  return {
    id: "st_1",
    accountId: "acc_credit",
    status: "PAID",
    currency: "USD",
    periodStart: "2026-08-21T00:00:00.000Z",
    closedAt: "2026-09-17T23:59:59.999Z",
    paidAt: "2026-10-01T15:00:00.000Z",
    amount: "50.4100",
    paidAmount: "50.4100",
    remainingAmount: "0",
    paidFromAccountId: "acc_clp",
    paidTransactionId: "tx_1",
    breakdown: { purchases: "50.4100", installments: "0", installmentCount: 0 },
    ...over,
  } as unknown as accounts.CreditStatement;
}

function renderPanel(st: accounts.CreditStatement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <EditStatementPaymentPanel account={CREDIT} statement={st} onOpenChange={() => {}} />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("EditStatementPaymentPanel — statement in another currency (spec 030)", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.mocked(accountsApi.list).mockResolvedValue([CREDIT, SOURCE_CLP, SOURCE_USD]);
    vi.mocked(accountsApi.updateStatementPayment).mockResolvedValue(statement());
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [{ currency: "USD", date: "2026-10-01", value: "980", valueDate: "2026-10-01" }],
      latest: { USD: null, CLF: null },
    });
  });

  it("asks for the corrected pesos too, suggested from the dollars, and sends both", async () => {
    renderPanel(statement());

    const dollars = await screen.findByLabelText("Monto");
    fireEvent.change(dollars, { target: { value: "40" } });
    const debited = (await screen.findByLabelText("Monto debitado en CLP")) as HTMLInputElement;
    await waitFor(() => expect(debited.value).toBe("39.200"));
    fireEvent.change(debited, { target: { value: "39.000" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));

    await waitFor(() => expect(accountsApi.updateStatementPayment).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.updateStatementPayment).mock.calls[0]).toEqual([
      "acc_credit",
      "st_1",
      "40",
      "39000",
    ]);
  });

  it("shows the dollars with their cents and keeps them in the statement's currency", async () => {
    renderPanel(statement());

    const dollars = (await screen.findByLabelText("Monto")) as HTMLInputElement;
    expect(dollars.value).toBe("50,41");
    expect(screen.getAllByText(/US\$50,41/).length).toBeGreaterThan(0);
  });

  it("a source in the statement's own currency needs one amount", async () => {
    renderPanel(statement({ paidFromAccountId: "acc_usd" }));

    fireEvent.change(await screen.findByLabelText("Monto"), { target: { value: "40" } });
    expect(screen.queryByLabelText(/Monto debitado/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));

    await waitFor(() => expect(accountsApi.updateStatementPayment).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.updateStatementPayment).mock.calls[0]![3]).toBeUndefined();
  });

  it("blocks saving until the corrected pesos are known", async () => {
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [],
      latest: { USD: null, CLF: null },
    });
    renderPanel(statement());

    fireEvent.change(await screen.findByLabelText("Monto"), { target: { value: "40" } });

    const save = screen.getByRole("button", { name: /Guardar/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(await screen.findByLabelText("Monto debitado en CLP"), {
      target: { value: "39.000" },
    });
    expect((screen.getByRole("button", { name: /Guardar/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("a statement in the account's own currency is corrected with one amount, as before", async () => {
    renderPanel(
      statement({
        currency: "CLP",
        amount: "100000.0000",
        paidAmount: "100000.0000",
        paidFromAccountId: "acc_clp",
      }),
    );

    fireEvent.change(await screen.findByLabelText("Monto"), { target: { value: "80.000" } });
    expect(screen.queryByLabelText(/Monto debitado/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));

    await waitFor(() => expect(accountsApi.updateStatementPayment).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.updateStatementPayment).mock.calls[0]).toEqual([
      "acc_credit",
      "st_1",
      "80000",
      undefined,
    ]);
  });
});
