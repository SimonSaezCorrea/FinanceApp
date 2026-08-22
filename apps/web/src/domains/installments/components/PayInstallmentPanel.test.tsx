import type { accounts as accountsContract, installments } from "@finance/contracts";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { PayInstallmentPanel, initialPayValue, toPayBody } from "./PayInstallmentPanel";

function payment(
  over: Partial<installments.InstallmentPayment> = {},
): installments.InstallmentPayment {
  return {
    id: "pay2",
    sequence: 2,
    dueDate: "2026-09-05T00:00:00.000Z",
    amount: "40000.0000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    dueAmount: "40000.0000",
    transactionId: null,
    ...over,
  };
}

function plan(over: Partial<installments.InstallmentPlan> = {}): installments.InstallmentPlan {
  return {
    id: "pl1",
    title: "Notebook",
    totalPrincipal: "120000.0000",
    installmentCount: 3,
    startDate: "2026-07-05T00:00:00.000Z",
    currency: "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: null,
    category: null,
    paymentAccountId: "aChecking",
    notes: null,
    payments: [payment()],
    paidTotal: "0.0000",
    remainingAmount: "120000.0000",
    nextDueDate: "2026-09-05T00:00:00.000Z",
    status: "ON_TRACK",
    generatesMovementOnPay: true,
    deletionImpact: null,
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...over,
  };
}

function account(over: Partial<accountsContract.BankAccount> = {}): accountsContract.BankAccount {
  return {
    id: "aChecking",
    name: "Cuenta Corriente",
    type: "CHECKING",
    status: "ACTIVE",
    currency: "CLP",
    accountNumber: "123",
    accountAlias: null,
    institution: null,
    institutionId: null,
    initialBalance: "500000.0000",
    currentBalance: "500000.0000",
    creditLimit: null,
    creditUsed: "0",
    creditUsedInitial: null,
    creditPools: [],
    overdraftLimit: "0",
    balanceCeiling: null,
    billingCycleDay: null,
    paymentDueDay: null,
    paymentMethod: "MANUAL",
    minimumPaymentPercent: null,
    balanceSeries: [],
    balanceChangePct: null,
    cards: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as accountsContract.BankAccount;
}

function renderPanel(
  opts: {
    plan?: installments.InstallmentPlan;
    payment?: installments.InstallmentPayment;
    accounts?: accountsContract.BankAccount[];
    value?: Partial<ReturnType<typeof initialPayValue>>;
  } = {},
) {
  const thePlan = opts.plan ?? plan();
  const thePayment = opts.payment ?? payment();
  const value = { ...initialPayValue(thePlan, thePayment, "2026-09-05"), ...opts.value };
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <PayInstallmentPanel
        open
        onOpenChange={vi.fn()}
        plan={thePlan}
        payment={thePayment}
        accounts={opts.accounts ?? [account()]}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </I18nextProvider>,
  );
  return { value, onSubmit, onChange };
}

describe("initialPayValue", () => {
  // FR-016a: what the instalment OWES — scheduled amount plus what it inherited —
  // not the scheduled amount, which would silently under-pay a carried-over debt.
  it("prefills with the amount owed, carry-over included", () => {
    const p = payment({ carriedOverAmount: "5000.0000", dueAmount: "45000.0000" });
    expect(initialPayValue(plan(), p, "2026-09-05").amount).toBe("45000");
  });

  it("prefills the account the plan remembers, and today's date", () => {
    const value = initialPayValue(plan(), payment(), "2026-09-05");
    expect(value.fromAccountId).toBe("aChecking");
    expect(value.date).toBe("2026-09-05");
  });
});

describe("PayInstallmentPanel", () => {
  it("shows what is owed and the balance after the payment", () => {
    renderPanel();
    expect(
      (screen.getByLabelText(i18n.t("installments.pay.amount")) as HTMLInputElement).value,
    ).toBe("40.000");
    // 500.000 − 40.000: stated before confirming, not discovered afterwards.
    expect(screen.getByText(/460[.,]000/)).toBeDefined();
  });

  // FR-034: with no account remembered there is nothing to pay from, and the form
  // must not let the request go out only to be refused.
  it("cannot be submitted without an account", () => {
    renderPanel({ plan: plan({ paymentAccountId: null }) });
    expect(screen.getByRole("button", { name: i18n.t("installments.payment.pay") })).toHaveProperty(
      "disabled",
      true,
    );
  });

  // FR-028b: paying debt with debt. Excluded from the selector, not just refused.
  it("does not offer credit-card accounts as the source", () => {
    renderPanel({
      plan: plan({ paymentAccountId: null }),
      accounts: [account({ id: "aCredit", name: "Visa Crédito", type: "CREDIT_CARD" })],
    });
    expect(screen.queryByText(/Visa Crédito/)).toBeNull();
  });

  // FR-029: two currencies, two figures, no conversion offered.
  it("asks for both amounts when the account is in another currency", () => {
    renderPanel({ accounts: [account({ currency: "USD" })] });
    expect(screen.getByTestId("dual-currency")).toBeDefined();
    expect(
      screen.getByLabelText(i18n.t("installments.pay.chargedAmount", { currency: "USD" })),
    ).toBeDefined();
  });

  it("asks for one amount when both are in the same currency", () => {
    renderPanel();
    expect(screen.queryByTestId("dual-currency")).toBeNull();
  });

  // FR-037: a CREDIT-card plan has no account and no movement to attribute to one.
  it("asks for no account on a plan that records no movement", () => {
    renderPanel({
      plan: plan({ generatesMovementOnPay: false, paymentAccountId: null }),
    });
    expect(screen.getByText(i18n.t("installments.pay.noMovement"))).toBeDefined();
  });
});

describe("toPayBody", () => {
  it("omits the charged amount when the currencies match", () => {
    const thePlan = plan();
    const value = initialPayValue(thePlan, payment(), "2026-09-05");
    expect(toPayBody(value, thePlan, { currency: "CLP" })).toMatchObject({
      fromAccountId: "aChecking",
      amount: "40000",
      chargedAmount: null,
    });
  });

  it("sends both amounts when they differ", () => {
    const thePlan = plan();
    const value = { ...initialPayValue(thePlan, payment(), "2026-09-05"), chargedAmount: "45" };
    expect(toPayBody(value, thePlan, { currency: "USD" })).toMatchObject({
      amount: "40000",
      chargedAmount: "45",
    });
  });

  it("sends no account on a plan that records no movement", () => {
    const thePlan = plan({ generatesMovementOnPay: false, paymentAccountId: null });
    const value = initialPayValue(thePlan, payment(), "2026-09-05");
    expect(toPayBody(value, thePlan, null).fromAccountId).toBeNull();
  });
});
