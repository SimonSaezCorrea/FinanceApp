import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { debts } from "@finance/contracts";

import i18n from "../../../i18n";
import { debtsApi } from "../api/debtsApi";
import { DebtsRoute } from "./DebtsRoute";

vi.mock("../api/debtsApi", () => ({
  debtsApi: {
    list: vi.fn(),
    settle: vi.fn(),
    unsettle: vi.fn(),
    registerPayment: vi.fn(),
    undoPayment: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

// jsdom has no real layout — `useElementWidth`'s `getBoundingClientRect` reads
// as 0, so the route always falls back to `DebtList` (the narrow-container
// rendering) in these tests. Every assertion below is written against
// behaviour both `DebtTable` and `DebtList` share (the row opens the same
// detail panel), so which one renders doesn't matter here.
vi.mock("../../accounts/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [
      {
        id: "acc1",
        name: "Cuenta Corriente",
        currency: "USD",
        currentBalance: "500000.0000",
      },
    ],
  }),
}));

vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { preferredCurrency: "USD" } }),
}));

function makeDebt(overrides: Partial<debts.Debt> = {}): debts.Debt {
  return {
    id: "d1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1240.5000",
    currency: "USD",
    openedAt: "2026-01-01T00:00:00.000Z",
    dueAt: null,
    interestApr: null,
    title: null,
    notes: null,
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    vi.mocked(debtsApi.list).mockResolvedValue([makeDebt()]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
  });

  it("shows the empty state when there are no debts", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("debts.empty"))).toBeDefined());
  });

  it("clicking a debt row opens its detail panel", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([makeDebt()]);
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
    fireEvent.click(screen.getByText(/Acme Corp/));

    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());
  });

  it("opening Editar from the detail panel switches to the edit form", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([makeDebt()]);
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
    fireEvent.click(screen.getByText(/Acme Corp/));
    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.edit") }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: i18n.t("common.saveChanges") })).toBeDefined(),
    );
  });
});
