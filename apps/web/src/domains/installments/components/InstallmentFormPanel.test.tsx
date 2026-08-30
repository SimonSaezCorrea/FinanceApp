import type { accounts as accountsContract } from "@finance/contracts";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { InstallmentFormPanel, emptyInstallmentForm } from "./InstallmentFormPanel";

function creditAccount(): accountsContract.BankAccount {
  return {
    id: "acc1",
    name: "CMR Visa",
    type: "CREDIT_CARD",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: null,
    accountAlias: null,
    initialBalance: "0.0000",
    currentBalance: "0.0000",
    overdraftLimit: "0.0000",
    balanceCeiling: null,
    creditLimit: "2000000.0000",
    creditUsed: "1080000.0000",
    creditPools: [],
    billingCycleDay: 5,
    billingCycleType: "BUSINESS_DAY",
    paymentMethod: "MANUAL",
    paymentDueDay: null,
    paymentDueCycleType: "BUSINESS_DAY",
    minimumPaymentPercent: null,
    balanceSeries: [],
    balanceChangePct: null,
    cards: [
      {
        id: "cCredit",
        name: "CMR Visa",
        kind: "CREDIT",
        last4: "4827",
        expiryMonth: 12,
        expiryYear: 2030,
        isActive: true,
        isPrimary: true,
        isVirtual: false,
        isAdditional: false,
        cardholderName: null,
        network: "VISA",
        ownUsed: "1080000.0000",
        limits: [],
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPanel(cardFrozen: boolean) {
  const value = {
    ...emptyInstallmentForm("2026-01-15"),
    title: "Notebook",
    totalPrincipal: "1080000",
    cardId: "cCredit",
  };
  render(
    <I18nextProvider i18n={i18n}>
      <InstallmentFormPanel
        open
        onOpenChange={vi.fn()}
        mode="edit"
        value={value}
        onChange={vi.fn()}
        accounts={[creditAccount()]}
        categoryOptions={[]}
        cardFrozen={cardFrozen}
        onSubmit={vi.fn()}
      />
    </I18nextProvider>,
  );
}

// Spec 014, FR-006b/FR-048: the card joins the fields editing already couldn't
// change, but ONLY once the plan has billed an instalment — never before.
describe("InstallmentFormPanel — frozen card (spec 014)", () => {
  it("shows the card inside the immutable notice, not as an editable field, once billed", () => {
    renderPanel(true);
    expect(screen.getByText(/CMR Visa/)).toBeDefined();
    expect(screen.queryByLabelText(i18n.t("installments.form.card"))).toBeNull();
  });

  it("still offers the editable card field when nothing has been billed yet", () => {
    renderPanel(false);
    expect(screen.getByLabelText(i18n.t("installments.form.card"))).toBeDefined();
  });
});
