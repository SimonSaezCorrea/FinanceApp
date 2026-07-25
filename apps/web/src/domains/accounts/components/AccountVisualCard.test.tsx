import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import { Providers } from "../../../app/providers";
import { AccountVisualCard } from "./AccountVisualCard";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

const card: accounts.Card = {
  id: "c1",
  name: "CMR Visa",
  kind: "CREDIT",
  last4: "4827",
  expiryMonth: 5,
  expiryYear: 2028,
  isActive: true,
  isPrimary: true,
  ownUsed: "1435990.0000",
  limits: [],
};

const account: accounts.BankAccount = {
  id: "a1",
  name: "CMR Falabella",
  type: "CREDIT_LINE",
  status: "ACTIVE",
  currency: "CLP",
  institution: "Falabella",
  institutionId: null,
  institutionName: "Falabella",
  accountNumber: null,
  initialBalance: "0.0000",
  currentBalance: "-1686470.0000",
  creditLimit: "3000000.0000",
  creditUsed: "1686470.0000",
  creditPools: [{ currency: "CLP", limit: "3000000.0000", used: "1686470.0000" }],
  billingCycleDay: null,
  paymentMethod: "MANUAL",
  balanceSeries: [],
  balanceChangePct: null,
  cards: [card],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderTile(props: Partial<Parameters<typeof AccountVisualCard>[0]> = {}) {
  me.mockResolvedValue({
    id: "u1",
    email: "a@b.com",
    name: "Javier",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
    theme: "dark",
    memberSinceYear: 2024,
    hideBalances: false,
  });
  return render(
    <Providers>
      <AccountVisualCard account={account} {...props} />
    </Providers>,
  );
}

describe("AccountVisualCard", () => {
  it("without `card` or `accountOnly`, falls back to the account's first card (e.g. an unresolved Wallet pin)", async () => {
    renderTile();
    await waitFor(() => expect(screen.getByText("CMR Visa")).toBeDefined());
    expect(screen.getByText(/4827/)).toBeDefined();
  });

  it("with `accountOnly`, shows the genuine account view even though the account has cards", async () => {
    renderTile({ accountOnly: true });
    await waitFor(() => expect(screen.getByText("Falabella")).toBeDefined());
    expect(screen.queryByText("CMR Visa")).toBeNull();
    expect(screen.queryByText(/4827/)).toBeNull();
  });

  it("under `accountOnly`, shows the account's combined creditUsed, not any single card's ownUsed", async () => {
    renderTile({ accountOnly: true });
    await waitFor(() => expect(screen.getByText(/1\.686\.470/)).toBeDefined());
  });
});
