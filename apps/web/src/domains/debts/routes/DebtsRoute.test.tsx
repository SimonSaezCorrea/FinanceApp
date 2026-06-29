import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { debtsApi } from "../api/debtsApi";
import { DebtsRoute } from "./DebtsRoute";

vi.mock("../api/debtsApi", () => ({
  debtsApi: { list: vi.fn(), settle: vi.fn(), registerPayment: vi.fn(), create: vi.fn() },
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <DebtsRoute />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("DebtsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders debts returned by the API", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([
      {
        id: "d1",
        direction: "YOU_OWE",
        counterparty: "Acme Corp",
        principal: "1240.5000",
        currency: "USD",
        openedAt: "2026-01-01T00:00:00.000Z",
        dueAt: null,
        interestApr: null,
        notes: null,
        settledAt: null,
        totalInstallments: 1,
        paidInstallments: 0,
        installmentAmount: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
  });

  it("shows the empty state when there are no debts", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("debts.empty"))).toBeDefined());
  });
});
