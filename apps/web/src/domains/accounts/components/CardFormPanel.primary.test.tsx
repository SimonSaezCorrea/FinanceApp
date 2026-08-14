import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { CardFormPanel } from "./CardFormPanel";

vi.mock("../../reference/hooks/useReference", () => ({
  useCurrencies: () => ({
    data: [
      { code: "CLP", name: "Peso", numeric: "152" },
      { code: "USD", name: "Dolar", numeric: "840" },
    ],
  }),
  useInstitutions: () => ({ data: [] }),
}));
vi.mock("../../auth/api/authApi", () => ({ authApi: { me: () => Promise.resolve(null) } }));

const account = {
  id: "a1",
  name: "Credit",
  type: "CREDIT_LINE" as const,
  status: "ACTIVE" as const,
  currency: "CLP",
  institution: null,
  institutionId: null,
  institutionName: null,
  accountNumber: null,
  initialBalance: "0",
  currentBalance: "0",
  creditLimit: "1000000",
  creditUsed: "0",
  creditPools: [],
  billingCycleDay: null,
  paymentMethod: "MANUAL" as const,
  minimumPaymentPercent: null,
  balanceSeries: [],
  balanceChangePct: null,
  cards: [],
  createdAt: "",
  updatedAt: "",
} satisfies accounts.BankAccount;

const primary: accounts.Card = {
  id: "c1",
  name: "Main",
  kind: "CREDIT",
  last4: "1111",
  expiryMonth: 12,
  expiryYear: 2030,
  isPrimary: true,
  isActive: true,
  limits: [],
  ownUsed: "0",
  prepaidBalance: null,
  prepaidInitialBalance: null,
};

describe("CardFormPanel · primary card extra limits", () => {
  it("offers the extra-currency section when editing the primary", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <CardFormPanel
            open
            onOpenChange={() => {}}
            account={account}
            hasExistingPrimary={false}
            initial={primary}
            onSubmit={() => {}}
          />
        </AuthProvider>
      </I18nextProvider>,
    );
    expect(screen.getByText(i18n.t("cards.form.extraLimits"))).toBeDefined();
    expect(screen.getByRole("button", { name: i18n.t("cards.form.addLimit") })).toBeDefined();
  });
});
