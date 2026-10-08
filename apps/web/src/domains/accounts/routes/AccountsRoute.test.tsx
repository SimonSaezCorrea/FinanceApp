import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import { accountsApi } from "../api/accountsApi";
import { AccountsRoute } from "./AccountsRoute";

vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: vi.fn() },
}));

vi.mock("../api/accountsApi", () => ({
  accountsApi: { list: vi.fn(), create: vi.fn() },
}));

// The route reads the signed-in user's preferred currency (for the "≈" hints).
vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { preferredCurrency: "CLP", extraCurrencies: [] } }),
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <AccountsRoute />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const account = {
  id: "a1",
  name: "Checking",
  type: "CHECKING" as const,
  status: "ACTIVE" as const,
  currency: "USD",
  institution: null,
  institutionId: null,
  institutionName: null,
  accountNumber: null,
  accountAlias: null,
  initialBalance: "1000.0000",
  overdraftLimit: "0",
  balanceCeiling: null,
  currentBalance: "1240.5000",
  creditLimit: "0.0000",
  creditUsed: "0",
  creditPools: [],
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY" as const,
  paymentMethod: "MANUAL" as const,
  paymentDueDay: null,
  paymentDueCycleType: "BUSINESS_DAY" as const,
  minimumPaymentPercent: null,
  balanceSeries: Array.from({ length: 30 }, () => "1240.5000"),
  balanceChangePct: "0.0",
  cards: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AccountsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [],
      latest: {
        USD: { currency: "USD", date: "2026-10-08", value: "950", valueDate: "2026-10-08" },
        CLF: null,
      },
    });
  });

  it("a USD account tile shows its balance in pesos, estimated, from the recorded dollar", async () => {
    vi.mocked(accountsApi.list).mockResolvedValue([account]);
    renderRoute();

    // 1.240,50 USD x 950 = 1.178.475 pesos (the account fixture is a USD one).
    expect((await screen.findAllByText(/≈ \$1\.178\.475/)).length).toBeGreaterThan(0);
  });

  it("renders an account tile with name and type", async () => {
    vi.mocked(accountsApi.list).mockResolvedValue([account]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(/Checking/)).toBeDefined());
    expect(screen.getByText(i18n.t("accounts.type.CHECKING"))).toBeDefined();
  });

  it("flags an inactive account on its tile", async () => {
    vi.mocked(accountsApi.list).mockResolvedValue([{ ...account, status: "INACTIVE" as const }]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("accounts.status.INACTIVE"))).toBeDefined());
  });

  it("shows the empty state when there are no accounts", async () => {
    vi.mocked(accountsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("accounts.empty"))).toBeDefined());
  });
});
