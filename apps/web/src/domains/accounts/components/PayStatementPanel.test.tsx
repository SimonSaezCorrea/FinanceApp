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
import { PayStatementPanel } from "./PayStatementPanel";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { list: vi.fn(), payCreditStatement: vi.fn(), prepayCreditStatement: vi.fn() },
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

const TODAY = localDay();

function account(overrides: Record<string, unknown>): accounts.BankAccount {
  return {
    id: "acc_credit",
    name: "BCI Platinum",
    type: "CREDIT_CARD",
    status: "ACTIVE",
    currency: "CLP",
    currentBalance: "0",
    minimumPaymentPercent: null,
    cards: [{ id: "card_1", kind: "CREDIT", isPrimary: true, last4: "7774", limits: [] }],
    ...overrides,
  } as unknown as accounts.BankAccount;
}

const CREDIT = account({});
const SOURCES = [
  account({ id: "acc_clp", name: "Cuenta CLP", type: "CHECKING", currency: "CLP", currentBalance: "1000000", cards: [] }),
  account({ id: "acc_usd", name: "Cuenta USD", type: "CHECKING", currency: "USD", currentBalance: "500.00", cards: [] }),
];

function statement(overrides: Record<string, unknown> = {}): accounts.CreditStatement {
  return {
    id: "st_1",
    accountId: "acc_credit",
    status: "PENDING",
    currency: "USD",
    periodStart: "2026-08-21T00:00:00.000Z",
    closedAt: "2026-09-17T23:59:59.999Z",
    paidAt: null,
    dueDate: "2026-10-01T23:59:59.999Z",
    amount: "50.4100",
    paidAmount: "0.0000",
    remainingAmount: "50.4100",
    minimumAmount: null,
    carriedOverAmount: "0.0000",
    prepaidAmount: "0.0000",
    breakdown: { purchases: "50.4100", installments: "0.0000", installmentCount: 0 },
    ...overrides,
  } as unknown as accounts.CreditStatement;
}

function usdRate(date: string, value: string, valueDate = date) {
  return { currency: "USD" as const, date, value, valueDate };
}

function renderPanel(props: Partial<React.ComponentProps<typeof PayStatementPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PayStatementPanel
            account={CREDIT}
            statement={statement()}
            onOpenChange={() => {}}
            {...props}
          />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/** The footer action ("Pagar US$50,41") — not the "Pagar con" source picker. */
const payButton = () => screen.getByRole("button", { name: /^Pagar (US)?\$/ });

async function pickSource(name: string) {
  fireEvent.click(await screen.findByLabelText("Pagar con"));
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
}

describe("PayStatementPanel — statement in another currency", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.mocked(accountsApi.list).mockResolvedValue(SOURCES.concat(CREDIT));
    vi.mocked(accountsApi.payCreditStatement).mockResolvedValue(statement({ status: "PAID" }));
    vi.mocked(accountsApi.prepayCreditStatement).mockResolvedValue(statement({ status: "OPEN" }));
    vi.mocked(exchangeRatesApi.list).mockReset();
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [usdRate(TODAY, "979.85")],
      latest: { USD: usdRate(TODAY, "979.85"), CLF: null },
    });
  });

  it("shows the dollars owed and suggests the pesos with the rate of the payment date", async () => {
    renderPanel();

    await pickSource("Cuenta CLP");

    const debited = await screen.findByLabelText("Monto debitado en CLP");
    await waitFor(() => expect((debited as HTMLInputElement).value).toBe("49.394"));
    expect(screen.getByText(/Estimado con el dólar del/)).toBeDefined();
    // The dollars are what the statement owes, in dollars.
    expect(screen.getAllByText(/US\$50,41/).length).toBeGreaterThan(0);
  });

  it("sends the dollars and the pesos exactly as shown, an edited pesos figure included", async () => {
    renderPanel();
    await pickSource("Cuenta CLP");
    const debited = await screen.findByLabelText("Monto debitado en CLP");
    await waitFor(() => expect((debited as HTMLInputElement).value).toBe("49.394"));

    fireEvent.change(debited, { target: { value: "49.000" } });
    fireEvent.click(payButton());

    await waitFor(() => expect(accountsApi.payCreditStatement).toHaveBeenCalled());
    const [id, statementId, body] = vi.mocked(accountsApi.payCreditStatement).mock.calls[0]!;
    expect([id, statementId]).toEqual(["acc_credit", "st_1"]);
    expect(body).toMatchObject({ fromAccountId: "acc_clp", chargedAmount: "49000" });
    // Editing the pesos never touched the dollars: paying in full leaves the amount out.
    expect(body.amount).toBeUndefined();
  });

  it("an untouched suggestion is what gets sent", async () => {
    renderPanel();
    await pickSource("Cuenta CLP");
    const debited = await screen.findByLabelText("Monto debitado en CLP");
    await waitFor(() => expect((debited as HTMLInputElement).value).toBe("49.394"));

    fireEvent.click(payButton());

    await waitFor(() => expect(accountsApi.payCreditStatement).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.payCreditStatement).mock.calls[0]![2]).toMatchObject({
      chargedAmount: "49394",
    });
  });

  it("with no recorded rate leaves the pesos empty, says so, and blocks payment until they are typed", async () => {
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [],
      latest: { USD: null, CLF: null },
    });
    renderPanel();
    await pickSource("Cuenta CLP");

    const debited = (await screen.findByLabelText("Monto debitado en CLP")) as HTMLInputElement;
    await screen.findByText(/No hay un valor del dólar registrado/);
    expect(debited.value).toBe("");
    const pay = payButton();
    expect((pay as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(debited, { target: { value: "50.000" } });

    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("marks a carried rate in the hint", async () => {
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [usdRate(TODAY, "979.85", "2026-10-05")],
      latest: { USD: usdRate(TODAY, "979.85", "2026-10-05"), CLF: null },
    });
    renderPanel();
    await pickSource("Cuenta CLP");

    expect(await screen.findByText(/Estimado con el último valor publicado/)).toBeDefined();
  });

  it("a source account in the statement's own currency needs one amount (no pesos field)", async () => {
    renderPanel();
    await pickSource("Cuenta USD");

    await waitFor(() => expect(screen.queryByLabelText("Monto debitado en USD")).toBeNull());
    fireEvent.click(payButton());

    await waitFor(() => expect(accountsApi.payCreditStatement).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.payCreditStatement).mock.calls[0]![2].chargedAmount).toBeUndefined();
  });

  it("a payment in the account's own currency is unchanged: no pesos field, no chargedAmount", async () => {
    renderPanel({
      statement: statement({ currency: "CLP", amount: "100000.0000", remainingAmount: "100000.0000", breakdown: { purchases: "100000.0000", installments: "0", installmentCount: 0 } }),
    });
    await pickSource("Cuenta CLP");

    expect(screen.queryByLabelText(/Monto debitado/)).toBeNull();
    fireEvent.click(payButton());

    await waitFor(() => expect(accountsApi.payCreditStatement).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.payCreditStatement).mock.calls[0]![2].chargedAmount).toBeUndefined();
  });

  it("prepay intent calls the prepay endpoint with the typed dollars and the pesos", async () => {
    renderPanel({
      intent: "prepay",
      statement: statement({ status: "OPEN", closedAt: null, dueDate: null }),
    });
    await pickSource("Cuenta CLP");

    fireEvent.change(await screen.findByLabelText("Monto"), { target: { value: "20" } });
    const debited = await screen.findByLabelText("Monto debitado en CLP");
    await waitFor(() => expect((debited as HTMLInputElement).value).toBe("19.597"));
    fireEvent.click(screen.getByRole("button", { name: /Prepagar/ }));

    await waitFor(() => expect(accountsApi.prepayCreditStatement).toHaveBeenCalled());
    expect(accountsApi.payCreditStatement).not.toHaveBeenCalled();
    expect(vi.mocked(accountsApi.prepayCreditStatement).mock.calls[0]![2]).toMatchObject({
      fromAccountId: "acc_clp",
      amount: "20",
      chargedAmount: "19597",
    });
  });

  it("lets the person type cents in the dollars of a partial payment", async () => {
    renderPanel();
    await pickSource("Cuenta CLP");

    fireEvent.click(screen.getByRole("button", { name: "Otro monto" }));
    fireEvent.change(await screen.findByLabelText("Monto"), { target: { value: "30,5" } });

    await waitFor(() =>
      expect((screen.getByLabelText("Monto debitado en CLP") as HTMLInputElement).value).toBe("29.885"),
    );
    fireEvent.click(payButton());
    await waitFor(() => expect(accountsApi.payCreditStatement).toHaveBeenCalled());
    expect(vi.mocked(accountsApi.payCreditStatement).mock.calls[0]![2]).toMatchObject({
      amount: "30.5",
      chargedAmount: "29885",
    });
  });
});
