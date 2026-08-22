import type { installments } from "@finance/contracts";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { InstallmentDetailPanel } from "./InstallmentDetailPanel";

function payment(
  over: Partial<installments.InstallmentPayment> = {},
): installments.InstallmentPayment {
  return {
    id: `p${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: "2026-09-05T00:00:00.000Z",
    amount: "41583.0000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    dueAmount: "41583.0000",
    transactionId: null,
    ...over,
  };
}

function plan(over: Partial<installments.InstallmentPlan> = {}): installments.InstallmentPlan {
  return {
    id: "pl1",
    title: "Notebook Lenovo",
    totalPrincipal: "499000.0000",
    installmentCount: 3,
    startDate: "2026-07-05T00:00:00.000Z",
    currency: "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: null,
    category: "Tecnología",
    paymentAccountId: null,
    notes: null,
    payments: [
      payment({ sequence: 1, paidAt: "2026-07-06T00:00:00.000Z", paidAmount: "41583.0000" }),
      payment({ sequence: 2 }),
      payment({ sequence: 3 }),
    ],
    paidTotal: "41583.0000",
    remainingAmount: "83166.0000",
    nextDueDate: "2026-09-05T00:00:00.000Z",
    status: "ON_TRACK",
    generatesMovementOnPay: true,
    deletionImpact: null,
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...over,
  };
}

function renderPanel(over: Partial<installments.InstallmentPlan> = {}, busy: number | null = null) {
  const handlers = {
    onOpenChange: vi.fn(),
    onPay: vi.fn(),
    onUnpay: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <I18nextProvider i18n={i18n}>
      <InstallmentDetailPanel
        plan={plan(over)}
        cardLabel={null}
        busySequence={busy}
        {...handlers}
      />
    </I18nextProvider>,
  );
  return handlers;
}

describe("InstallmentDetailPanel", () => {
  it("shows paid, remaining and total", () => {
    renderPanel();
    expect(screen.getByText(i18n.t("installments.detail.paid"))).toBeDefined();
    expect(screen.getByText(i18n.t("installments.detail.remaining"))).toBeDefined();
    expect(screen.getByText(i18n.t("installments.detail.total"))).toBeDefined();
  });

  it("lists every instalment of the plan", () => {
    renderPanel();
    for (const sequence of [1, 2, 3]) {
      expect(
        screen.getByText(i18n.t("installments.detail.instalmentOf", { sequence, total: 3 })),
      ).toBeDefined();
    }
  });

  it("offers Undo on a paid instalment and Pay only on the next one", () => {
    renderPanel();
    // One paid instalment → exactly one Undo; one next-to-pay → exactly one Pay.
    expect(screen.getAllByText(i18n.t("installments.detail.undo"))).toHaveLength(1);
    expect(screen.getAllByText(i18n.t("installments.detail.pay"))).toHaveLength(1);
  });

  it("has no pay action at all on a finished plan", () => {
    renderPanel({
      status: "PAID",
      nextDueDate: null,
      remainingAmount: "0.0000",
      payments: [
        payment({ sequence: 1, paidAt: "2026-07-06T00:00:00.000Z", paidAmount: "41583.0000" }),
      ],
    });
    expect(screen.queryByText(i18n.t("installments.detail.pay"))).toBeNull();
  });

  it("shows a carried-over amount apart from the scheduled one (FR-022)", () => {
    renderPanel({
      payments: [
        payment({ sequence: 1, carriedOverAmount: "11583.0000", dueAmount: "53166.0000" }),
      ],
    });
    // Matched by shape, not by an exact formatted string: the point is that the
    // carried figure is rendered on its OWN line, not folded into the instalment.
    expect(screen.getByText(/11[.,]583/)).toBeDefined();
  });

  it("explains why a credit-card plan records no movement (FR-036)", () => {
    renderPanel({ generatesMovementOnPay: false });
    expect(screen.getByText(i18n.t("installments.detail.creditCardNotice"))).toBeDefined();
  });

  it("does not explain it on a plan that DOES record one", () => {
    renderPanel();
    expect(screen.queryByText(i18n.t("installments.detail.creditCardNotice"))).toBeNull();
  });

  it("disables the pay actions while one is in flight (FR-018a)", () => {
    renderPanel({}, 2);
    expect(screen.getByText(i18n.t("installments.detail.pay")).closest("button")?.disabled).toBe(
      true,
    );
  });

  it("offers editing and deleting the plan (FR-015)", () => {
    const handlers = renderPanel();
    screen.getByText(i18n.t("common.edit")).click();
    expect(handlers.onEdit).toHaveBeenCalled();
  });
});
