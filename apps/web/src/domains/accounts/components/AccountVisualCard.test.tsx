import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import { Providers } from "../../../app/providers";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import { AccountVisualCard } from "./AccountVisualCard";

vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: vi.fn() },
}));

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
  isVirtual: false,
  isAdditional: false,
  cardholderName: null,
  network: null,
  ownUsed: "1435990.0000",
  limits: [],
};

const account: accounts.BankAccount = {
  id: "a1",
  name: "CMR Falabella",
  type: "CREDIT_CARD",
  status: "ACTIVE",
  currency: "CLP",
  institution: "Falabella",
  institutionId: null,
  institutionName: "Falabella",
  accountNumber: null,
  accountAlias: null,
  initialBalance: "0.0000",
  overdraftLimit: "0",
  balanceCeiling: null,
  currentBalance: "-1686470.0000",
  creditLimit: "3000000.0000",
  creditUsed: "1686470.0000",
  creditPools: [{ currency: "CLP", limit: "3000000.0000", used: "1686470.0000" }],
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
  paymentMethod: "MANUAL",
  paymentDueDay: null,
  paymentDueCycleType: "BUSINESS_DAY",
  minimumPaymentPercent: null,
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

describe("AccountVisualCard — pesos equivalent (spec 030)", () => {
  const checking = (over: Partial<accounts.BankAccount>): accounts.BankAccount => ({
    ...account,
    type: "CHECKING",
    creditLimit: "0",
    creditUsed: "0",
    creditPools: [],
    cards: [],
    ...over,
  });

  beforeEach(() => {
    vi.mocked(exchangeRatesApi.list).mockReset();
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [],
      latest: {
        USD: { currency: "USD", date: "2026-10-08", value: "950", valueDate: "2026-10-08" },
        CLF: null,
      },
    });
  });

  it("a USD account shows the estimated pesos under its balance", async () => {
    renderTile({
      account: checking({ currency: "USD", currentBalance: "1000.0000" }),
      accountOnly: true,
    });

    expect(await screen.findByText(/≈ \$950\.000/)).toBeDefined();
  });

  it("a CLP account shows none", async () => {
    renderTile({
      account: checking({ currency: "CLP", currentBalance: "1000000.0000" }),
      accountOnly: true,
    });

    // The shared test client may already hold the rates (cached): wait on the tile instead.
    await screen.findByText("Falabella");
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});
