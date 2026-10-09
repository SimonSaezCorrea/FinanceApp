import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import { AccountsSummary } from "./AccountsSummary";
import { EstimatedTotalLine } from "./EstimatedTotalLine";

vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: vi.fn() },
}));
vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { hideBalances: false } }),
}));

const rate = (currency: "USD" | "CLF", value: string, valueDate = "2026-10-08") => ({
  currency,
  date: "2026-10-08",
  value,
  valueDate,
});

function respond(latest: {
  USD: ReturnType<typeof rate> | null;
  CLF: ReturnType<typeof rate> | null;
}) {
  vi.mocked(exchangeRatesApi.list).mockResolvedValue({ items: [], latest });
}

function renderIt(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>,
  );
}

const net = (currency: string, value: string) => ({ currency, net: value });

describe("EstimatedTotalLine (spec 030)", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.mocked(exchangeRatesApi.list).mockReset();
  });

  it("shows the one estimated total in pesos, labelled and dated", async () => {
    respond({ USD: rate("USD", "950"), CLF: rate("CLF", "41000") });
    renderIt(<EstimatedTotalLine nets={[net("CLP", "750000"), net("USD", "400")]} />);

    const line = await screen.findByText(/≈ \$1\.130\.000/);
    expect(line.textContent).toContain("todo en CLP");
    expect(line.textContent).toContain("estimado");
    expect(line.textContent).toContain("8 oct");
  });

  it("includes the UF in the total", async () => {
    respond({ USD: rate("USD", "950"), CLF: rate("CLF", "41000") });
    renderIt(<EstimatedTotalLine nets={[net("CLP", "0"), net("CLF", "2")]} />);

    expect(await screen.findByText(/≈ \$82\.000/)).toBeDefined();
  });

  it("is hidden when there is only pesos", async () => {
    respond({ USD: rate("USD", "950"), CLF: null });
    const { container } = renderIt(<EstimatedTotalLine nets={[net("CLP", "750000")]} />);

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("is hidden when a foreign balance has no recorded rate (it would silently drop it)", async () => {
    respond({ USD: null, CLF: null });
    const { container } = renderIt(
      <EstimatedTotalLine nets={[net("CLP", "750000"), net("USD", "400")]} />,
    );

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("AccountsSummary with a USD account (spec 030)", () => {
  const account = (over: Record<string, unknown>) =>
    ({
      id: "a",
      type: "CHECKING",
      status: "ACTIVE",
      currency: "CLP",
      currentBalance: "0",
      creditUsed: "0",
      ...over,
    }) as unknown as accounts.BankAccount;

  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.mocked(exchangeRatesApi.list).mockReset();
    respond({ USD: rate("USD", "950"), CLF: rate("CLF", "41000") });
  });

  it("keeps the per-currency figures unconverted and adds the estimated total beside them", async () => {
    renderIt(
      <AccountsSummary
        list={[
          account({ currentBalance: "750000" }),
          account({ id: "u", currency: "USD", currentBalance: "400" }),
        ]}
        primaryCurrency="CLP"
      />,
    );

    // The hero and the USD chip are what the person has, each in its own currency.
    expect(screen.getAllByText("$750.000").length).toBeGreaterThan(0);
    expect(screen.getByText("US$400,00")).toBeDefined();
    // The single estimate is a separate, labelled line.
    expect(await screen.findByText(/≈ \$1\.130\.000/)).toBeDefined();
  });

  it("shows no estimated total on an account list that is only pesos", async () => {
    renderIt(
      <AccountsSummary list={[account({ currentBalance: "750000" })]} primaryCurrency="CLP" />,
    );

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(screen.queryByText(/todo en CLP/)).toBeNull();
  });

  it("shows no estimated total while the accounts are unavailable (stale cache is not an answer)", async () => {
    renderIt(<AccountsSummary list={[account({})]} primaryCurrency="CLP" unavailable />);

    // The line is not even mounted: nothing is read, nothing is estimated.
    expect(exchangeRatesApi.list).not.toHaveBeenCalled();
    expect(screen.queryByText(/todo en CLP/)).toBeNull();
  });
});
