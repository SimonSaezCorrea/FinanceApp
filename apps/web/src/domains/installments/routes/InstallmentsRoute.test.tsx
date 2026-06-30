import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { installmentsApi } from "../api/installmentsApi";
import { InstallmentsRoute } from "./InstallmentsRoute";

vi.mock("../api/installmentsApi", () => ({
  installmentsApi: { list: vi.fn() },
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <InstallmentsRoute />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("InstallmentsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a plan with its paid progress", async () => {
    vi.mocked(installmentsApi.list).mockResolvedValue([
      {
        id: "p1",
        title: "Laptop",
        totalPrincipal: "1200.0000",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        notes: null,
        createdAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
        payments: [
          {
            id: "a",
            sequence: 1,
            dueDate: "2026-01-15T00:00:00.000Z",
            amount: "400.0000",
            paidAt: "2026-01-16T00:00:00.000Z",
          },
          {
            id: "b",
            sequence: 2,
            dueDate: "2026-02-15T00:00:00.000Z",
            amount: "400.0000",
            paidAt: null,
          },
          {
            id: "c",
            sequence: 3,
            dueDate: "2026-03-15T00:00:00.000Z",
            amount: "400.0000",
            paidAt: null,
          },
        ],
      },
    ]);

    renderRoute();
    await waitFor(() => expect(screen.getByText(/Laptop/)).toBeDefined());
  });

  it("shows the empty state when there are no plans", async () => {
    vi.mocked(installmentsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("installments.empty"))).toBeDefined());
  });
});
