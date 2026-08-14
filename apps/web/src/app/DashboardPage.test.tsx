import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
import { Providers } from "./providers";
import { DashboardPage } from "./DashboardPage";

vi.mock("../domains/accounts/api/accountsApi", () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../domains/transactions/api/transactionsApi", () => ({
  transactionsApi: {
    list: vi.fn().mockResolvedValue([]),
    summary: vi.fn().mockResolvedValue({ total: 0, currencyTotals: [], categories: [] }),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    transfer: { get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    attachments: { list: vi.fn(), upload: vi.fn(), url: vi.fn(), remove: vi.fn() },
  },
}));
vi.mock("../domains/installments/api/installmentsApi", () => ({
  installmentsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../domains/debts/api/debtsApi", () => ({
  debtsApi: { list: vi.fn().mockResolvedValue([]) },
}));

describe("DashboardPage", () => {
  it("renders the panel with the net-worth summary", async () => {
    render(
      <Providers>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Providers>,
    );
    expect(screen.getByRole("heading", { name: i18n.t("dashboard.title") })).toBeDefined();
    await waitFor(() => expect(screen.getByText(i18n.t("dashboard.netWorth"))).toBeDefined());
  });
});
