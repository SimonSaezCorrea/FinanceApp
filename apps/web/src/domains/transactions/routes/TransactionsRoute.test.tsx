import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { transactionsApi } from "../api/transactionsApi";
import { TransactionsRoute } from "./TransactionsRoute";

vi.mock("../api/transactionsApi", () => ({
  transactionsApi: { list: vi.fn() },
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <TransactionsRoute />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("TransactionsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders transactions returned by the API", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue([
      {
        id: "t1",
        type: "EXPENSE",
        amount: "33.3000",
        currency: "USD",
        occurredAt: "2026-03-01T00:00:00.000Z",
        category: "food",
        description: null,
        bankAccountId: null,
        installmentPlanId: null,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ]);

    renderRoute();
    await waitFor(() => expect(screen.getByText(/food/)).toBeDefined());
  });

  it("shows the empty state when there are no transactions", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("transactions.empty"))).toBeDefined());
  });
});
