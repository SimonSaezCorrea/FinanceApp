import type { installments } from "@finance/contracts";
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

vi.mock("../../accounts/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: [] }),
}));

function payment(
  over: Partial<installments.InstallmentPayment> = {},
): installments.InstallmentPayment {
  return {
    id: `p${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: "2026-02-15T00:00:00.000Z",
    amount: "400.0000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    dueAmount: "400.0000",
    transactionId: null,
    ...over,
  };
}

function plan(over: Partial<installments.InstallmentPlan> = {}): installments.InstallmentPlan {
  return {
    id: "p1",
    title: "Laptop",
    totalPrincipal: "1200.0000",
    installmentCount: 3,
    startDate: "2026-01-15T00:00:00.000Z",
    currency: "USD",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: null,
    category: null,
    paymentAccountId: null,
    notes: null,
    payments: [
      payment({
        sequence: 1,
        dueDate: "2026-01-15T00:00:00.000Z",
        paidAt: "2026-01-16T00:00:00.000Z",
        paidAmount: "400.0000",
      }),
      payment({ sequence: 2, dueDate: "2026-02-15T00:00:00.000Z" }),
      payment({ sequence: 3, dueDate: "2026-03-15T00:00:00.000Z" }),
    ],
    paidTotal: "400.0000",
    remainingAmount: "800.0000",
    nextDueDate: "2026-02-15T00:00:00.000Z",
    status: "ON_TRACK",
    generatesMovementOnPay: true,
    deletionImpact: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...over,
  };
}

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

  it("renders ONE row per plan, not one per instalment", async () => {
    // The whole point of the redesign: three instalments used to mean three rows.
    vi.mocked(installmentsApi.list).mockResolvedValue([plan()]);

    renderRoute();
    await waitFor(() => expect(screen.getByText("Laptop")).toBeDefined());
    expect(screen.getAllByText("Laptop")).toHaveLength(1);
  });

  it("shows the plan's progress and what is left", async () => {
    vi.mocked(installmentsApi.list).mockResolvedValue([plan()]);

    renderRoute();
    await waitFor(() => expect(screen.getByText("1/3")).toBeDefined());
  });

  it("counts a PAID plan out of the active tally", async () => {
    vi.mocked(installmentsApi.list).mockResolvedValue([
      plan({ id: "a", title: "Laptop" }),
      plan({
        id: "b",
        title: "Fridge",
        status: "PAID",
        nextDueDate: null,
        remainingAmount: "0.0000",
      }),
    ]);

    renderRoute();
    await waitFor(() => expect(screen.getByText("Fridge")).toBeDefined());
    // Two plans listed, one of them finished.
    expect(screen.getByText(i18n.t("installments.kpi.activePlans"))).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
  });

  it("shows the empty state when there are no plans", async () => {
    vi.mocked(installmentsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("installments.empty"))).toBeDefined());
  });

  it("shows an error state, NOT the empty state, when the load fails", async () => {
    // Telling someone they have no plans when the request failed is a lie they act on.
    vi.mocked(installmentsApi.list).mockRejectedValue(new Error("boom"));
    renderRoute();
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.queryByText(i18n.t("installments.empty"))).toBeNull();
  });
});
