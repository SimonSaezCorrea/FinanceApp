import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { savings } from "@finance/contracts";

import i18n from "../../../i18n";
import { savingsApi } from "../api/savingsApi";
import { SavingsRoute } from "./SavingsRoute";

vi.mock("../api/savingsApi", () => ({
  savingsApi: {
    listGoals: vi.fn(),
    listEntries: vi.fn(),
    summary: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    removeGoal: vi.fn(),
    closeGoal: vi.fn(),
    reopenGoal: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    removeEntry: vi.fn(),
  },
}));

vi.mock("../../accounts/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [
      {
        id: "acc1",
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "USD",
        currentBalance: "500000.0000",
        cards: [],
      },
    ],
  }),
}));

vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { preferredCurrency: "USD" } }),
}));

function makeGoal(overrides: Partial<savings.SavingsGoal> = {}): savings.SavingsGoal {
  return {
    id: "g1",
    title: "Emergency fund",
    targetAmount: "5000.0000",
    currency: "USD",
    deadline: null,
    notes: null,
    color: null,
    closedAt: null,
    closeDestination: null,
    closeAccountId: null,
    closeTargetGoalId: null,
    savedAmount: "0.0000",
    pace: "0.0000",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const emptySummary: savings.SavingsSummary = {
  totalSaved: "0.0000",
  freeSavingsTotal: "0.0000",
  pace: "0.0000",
  missing: "0.0000",
};

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(savingsApi.listEntries).mockResolvedValue([]);
    vi.mocked(savingsApi.summary).mockResolvedValue(emptySummary);
  });

  it("renders savings goals returned by the API, grouped as 'sin aportes'", async () => {
    vi.mocked(savingsApi.listGoals).mockResolvedValue([makeGoal()]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Emergency fund/)).toBeDefined());
    expect(screen.getByText(i18n.t("savings.status.noContributions"))).toBeDefined();
  });

  it("shows the empty state when there are no goals and no free-savings entries", async () => {
    vi.mocked(savingsApi.listGoals).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("savings.empty"))).toBeDefined());
  });

  it("clicking a goal row opens its detail panel", async () => {
    vi.mocked(savingsApi.listGoals).mockResolvedValue([makeGoal()]);
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Emergency fund/)).toBeDefined());
    fireEvent.click(screen.getByText(/Emergency fund/));

    await waitFor(() => expect(screen.getByText(i18n.t("savings.detail.eyebrow"))).toBeDefined());
  });

  it("a cumplida goal shows the close action", async () => {
    vi.mocked(savingsApi.listGoals).mockResolvedValue([makeGoal({ savedAmount: "5000.0000" })]);
    renderRoute();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: i18n.t("savings.row.closeComplete") }),
      ).toBeDefined(),
    );
  });
});
