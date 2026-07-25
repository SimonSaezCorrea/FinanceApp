import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { accountsApi } from "../api/accountsApi";
import { AccountsRoute } from "./AccountsRoute";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { list: vi.fn(), create: vi.fn() },
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
  initialBalance: "1000.0000",
  currentBalance: "1240.5000",
  creditLimit: "0.0000",
  creditUsed: "0",
  creditPools: [],
  billingCycleDay: null,
  paymentMethod: "MANUAL" as const,
  balanceSeries: Array.from({ length: 30 }, () => "1240.5000"),
  balanceChangePct: "0.0",
  cards: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AccountsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

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
