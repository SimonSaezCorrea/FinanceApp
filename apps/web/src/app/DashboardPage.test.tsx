import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`^${i18n.t("dashboard.netWorth")}`))).toBeDefined(),
    );
    // Nothing due: the strip says so instead of disappearing (the skeleton has the net-worth
    // label too, so wait for the loaded view itself).
    expect(await screen.findByText(i18n.t("dashboard.attention.none"))).toBeDefined();
  });

  it("on a narrow Panel the month, payments and wallet are tabs", async () => {
    // jsdom measures 0px, which is the phone layout.
    render(
      <Providers>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Providers>,
    );
    const tabs = await screen.findByRole("group", { name: i18n.t("dashboard.tabs.label") });
    expect(screen.getByText(i18n.t("dashboard.in"))).toBeDefined();
    fireEvent.click(within(tabs).getByRole("button", { name: i18n.t("dashboard.tabs.payments") }));
    expect(screen.getByText(i18n.t("dashboard.upcomingEmpty"))).toBeDefined();
    expect(screen.queryByText(i18n.t("dashboard.in"))).toBeNull();
  });
});
