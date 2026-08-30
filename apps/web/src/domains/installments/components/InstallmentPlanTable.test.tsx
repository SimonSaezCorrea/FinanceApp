import type { installments } from "@finance/contracts";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { InstallmentPlanTable } from "./InstallmentPlanTable";

function payment(
  over: Partial<installments.InstallmentPayment> = {},
): installments.InstallmentPayment {
  return {
    id: `p${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: "2026-09-05T00:00:00.000Z",
    amount: "90000.0000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    dueAmount: "90000.0000",
    transactionId: null,
    creditStatementId: null,
    status: "SCHEDULED" as const,
    ...over,
  };
}

function plan(over: Partial<installments.InstallmentPlan> = {}): installments.InstallmentPlan {
  return {
    id: "pl1",
    title: "Notebook ASUS",
    totalPrincipal: "1080000.0000",
    installmentCount: 12,
    startDate: "2026-01-05T00:00:00.000Z",
    currency: "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: "cCredit",
    category: "Tecnología",
    paymentAccountId: null,
    notes: null,
    payments: [payment()],
    paidTotal: "0.0000",
    remainingAmount: "990000.0000",
    nextDueDate: "2026-09-05T00:00:00.000Z",
    status: "ON_TRACK",
    generatesMovementOnPay: false,
    scheduledCount: 6,
    billedCount: 1,
    paidCount: 5,
    billingWarning: null,
    deletionImpact: null,
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...over,
  };
}

function renderTable(plans: installments.InstallmentPlan[]) {
  render(
    <I18nextProvider i18n={i18n}>
      <InstallmentPlanTable
        plans={plans}
        cardLabels={new Map()}
        selectedId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        emptyTitle="No plans"
      />
    </I18nextProvider>,
  );
}

describe("InstallmentPlanTable billed/scheduled counters (spec 014, FR-019)", () => {
  it("shows the billed and scheduled counts for a credit-card plan with billed instalments", () => {
    renderTable([plan()]);
    const billed = i18n.t("installments.counters.billed", { count: 1 });
    const scheduled = i18n.t("installments.counters.scheduled", { count: 6 });
    expect(
      screen.getByText((content) => content.includes(billed) && content.includes(scheduled)),
    ).toBeDefined();
  });

  it("shows nothing extra for a plan with no billed instalments", () => {
    renderTable([plan({ cardId: null, generatesMovementOnPay: true, billedCount: 0 })]);
    expect(screen.queryByText(/facturada/)).toBeNull();
  });
});
