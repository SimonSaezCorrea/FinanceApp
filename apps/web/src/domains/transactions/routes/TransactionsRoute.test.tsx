import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { transactions as contract } from "@finance/contracts";

import i18n from "../../../i18n";
import { transactionsApi } from "../api/transactionsApi";
import { TransactionsRoute } from "./TransactionsRoute";

vi.mock("../api/transactionsApi", () => ({
  transactionsApi: {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    transfer: { get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    attachments: { list: vi.fn(), upload: vi.fn(), url: vi.fn(), remove: vi.fn() },
  },
}));

const emptySummary = { total: 0, currencyTotals: [], categories: [] };

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

  it("renders the first page of transactions returned by the API", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue({
      items: [
        {
          id: "t1",
          type: "EXPENSE",
          amount: "33.3000",
          currency: "USD",
          occurredAt: "2026-03-01T00:00:00.000Z",
          category: "food",
          description: null,
          observation: null,
          emisor: null,
          receptor: null,
          lugar: null,
          bankAccountId: null,
          cardId: null,
          financeCharge: false,
          installmentPlanId: null,
          transferGroupId: null,
          debtId: null,
          recurringExpenseId: null,
          savingsEntryId: null,
          savingsGoalId: null,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    vi.mocked(transactionsApi.summary).mockResolvedValue(emptySummary);

    renderRoute();
    await waitFor(() => expect(screen.getAllByText(/food/).length).toBeGreaterThan(0));
  });

  it("requests a bounded page rather than the whole table", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(transactionsApi.summary).mockResolvedValue(emptySummary);

    renderRoute();

    await waitFor(() => expect(transactionsApi.list).toHaveBeenCalled());
    expect(vi.mocked(transactionsApi.list).mock.calls[0]![0]).toMatchObject({
      limit: contract.TRANSACTION_PAGE_SIZE,
    });
  });

  it("takes the movement count from the summary, not from the loaded page", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue({ items: [], nextCursor: null });
    // 137 matches overall while page one is empty — the count must follow the
    // summary, which is the whole point of the separate aggregate query.
    vi.mocked(transactionsApi.summary).mockResolvedValue({ ...emptySummary, total: 137 });

    renderRoute();
    expect(await screen.findByText(/137/)).toBeDefined();
  });

  it("shows the empty state when there are no transactions", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(transactionsApi.summary).mockResolvedValue(emptySummary);
    renderRoute();
    expect(await screen.findByText(i18n.t("transactions.empty"))).toBeDefined();
  });
});
