import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { FinancialCustomizationSection } from "./FinancialCustomizationSection";

const updatePreferences = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: {
    updatePreferences: (...args: unknown[]) => updatePreferences(...args),
  },
}));
const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));
vi.mock("../../reference/api/referenceApi", () => ({
  referenceApi: {
    currencies: vi.fn().mockResolvedValue([
      { id: "c-usd", code: "USD", numeric: "840", name: "Dólar estadounidense" },
      { id: "c-eur", code: "EUR", numeric: "978", name: "Euro" },
    ]),
  },
}));

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
    theme: "dark",
    memberSinceYear: 2024,
    hideBalances: false,
    monthlyBudgetTarget: null,
    billingCycleStartDay: 1,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    ...overrides,
  };
}

describe("FinancialCustomizationSection", () => {
  it("toggling 'Ocultar saldos' persists via updatePreferences (real, not a placeholder)", async () => {
    updatePreferences.mockResolvedValue(baseUser({ hideBalances: true }));
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <FinancialCustomizationSection />
      </Providers>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.financial.title") }),
    );
    const el = screen.getByRole("switch", { name: i18n.t("profile.financial.hideBalances") });
    fireEvent.click(el);
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ hideBalances: true }));
  });

  it("selecting an extra currency persists the array", async () => {
    updatePreferences.mockResolvedValue(baseUser({ extraCurrencies: ["USD"] }));
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <FinancialCustomizationSection />
      </Providers>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.financial.title") }),
    );
    const select = await screen.findByDisplayValue(i18n.t("profile.financial.addCurrencyPlaceholder"));
    fireEvent.change(select, { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.financial.addCurrency") }));
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ extraCurrencies: ["USD"] }));
  });
});
