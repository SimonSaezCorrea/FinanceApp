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
    theme: "dark",
    memberSinceYear: 2024,
    hideBalances: false,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    ...overrides,
  };
}

describe("FinancialCustomizationSection", () => {
  // specs/020, User Story 3: "Inicio del ciclo mensual", "Presupuesto mensual
  // objetivo" and "Redondeo para ahorro" never had a real effect and were
  // removed — only "Monedas extra" and "Ocultar saldos" remain.
  it("only offers 'Monedas extra' and 'Ocultar saldos' — the 3 decorative controls are gone", async () => {
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <FinancialCustomizationSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.financial.title") }));

    expect(screen.getByText(i18n.t("profile.financial.extraCurrencies"))).toBeDefined();
    expect(screen.getByText(i18n.t("profile.financial.hideBalances"))).toBeDefined();
    expect(screen.queryByText(i18n.t("profile.financial.cycleStart"))).toBeNull();
    expect(screen.queryByText(i18n.t("profile.financial.budgetTarget"))).toBeNull();
    expect(screen.queryByText(i18n.t("profile.financial.roundUp"))).toBeNull();
  });

  it("toggling 'Ocultar saldos' persists via updatePreferences (real, not a placeholder)", async () => {
    updatePreferences.mockResolvedValue(baseUser({ hideBalances: true }));
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <FinancialCustomizationSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.financial.title") }));
    const el = screen.getByRole("switch", { name: i18n.t("profile.financial.hideBalances") });
    fireEvent.click(el);
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ hideBalances: true }));
  });

  it("selecting an extra currency from the dropdown adds it immediately (no separate 'Agregar' step)", async () => {
    updatePreferences.mockResolvedValue(baseUser({ extraCurrencies: ["USD"] }));
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <FinancialCustomizationSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.financial.title") }));
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.financial.extraCurrencies") }),
    );
    fireEvent.click(await screen.findByText("USD · Dólar estadounidense"));
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ extraCurrencies: ["USD"] }),
    );
  });

  it("disables the dropdown once every currency is already selected", async () => {
    me.mockResolvedValue(baseUser({ extraCurrencies: ["USD", "EUR"] }));
    render(
      <Providers>
        <FinancialCustomizationSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.financial.title") }));
    const dropdown = await screen.findByRole("button", {
      name: i18n.t("profile.financial.extraCurrencies"),
    });
    expect(dropdown.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(i18n.t("profile.financial.noMoreCurrencies"))).toBeDefined();
  });
});
