import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { savingsApi } from "../api/savingsApi";
import { SavingsRoute } from "./SavingsRoute";

vi.mock("../api/savingsApi", () => ({
  savingsApi: { listGoals: vi.fn() },
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <SavingsRoute />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("SavingsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders savings goals returned by the API", async () => {
    vi.mocked(savingsApi.listGoals).mockResolvedValue([
      {
        id: "g1",
        title: "Emergency fund",
        targetAmount: "5000.0000",
        currency: "USD",
        deadline: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Emergency fund/)).toBeDefined());
  });

  it("shows the empty state when there are no goals", async () => {
    vi.mocked(savingsApi.listGoals).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("savings.empty"))).toBeDefined());
  });
});
