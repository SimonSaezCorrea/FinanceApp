import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { investmentsApi } from "../api/investmentsApi";
import { InvestmentsRoute } from "./InvestmentsRoute";

vi.mock("../api/investmentsApi", () => ({
  investmentsApi: { list: vi.fn() },
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <InvestmentsRoute />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("InvestmentsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders investments returned by the API", async () => {
    vi.mocked(investmentsApi.list).mockResolvedValue([
      {
        id: "i1",
        kind: "ETF",
        label: "Vanguard S&P 500",
        currency: "USD",
        symbol: "VOO",
        shares: "12.34567890",
        annualRate: null,
        principal: null,
        bankAccountId: null,
        openedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Vanguard S&P 500/)).toBeDefined());
  });

  it("shows the empty state when there are no investments", async () => {
    vi.mocked(investmentsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("investments.empty"))).toBeDefined());
  });
});
