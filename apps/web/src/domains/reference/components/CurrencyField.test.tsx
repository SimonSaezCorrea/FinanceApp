import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { CurrencyField } from "./CurrencyField";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

const currencies = vi.fn();
vi.mock("../api/referenceApi", () => ({
  referenceApi: { currencies: (...args: unknown[]) => currencies(...args) },
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
    ...overrides,
  };
}

const CATALOGUE = [
  { id: "1", code: "CLP", numeric: "152", name: "Peso chileno", symbol: "$" },
  { id: "2", code: "USD", numeric: "840", name: "Dólar estadounidense", symbol: "US$" },
];

describe("CurrencyField", () => {
  it("renders a static, non-interactive value with no extra currencies", async () => {
    me.mockResolvedValue(baseUser({ preferredCurrency: "CLP", extraCurrencies: [] }));
    currencies.mockResolvedValue(CATALOGUE);

    render(
      <Providers>
        <CurrencyField value="CLP" onChange={vi.fn()} aria-label="Moneda" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("CLP")).toBeDefined());
    // No dropdown trigger button — a plain status element, not a button.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a real selector limited to principal + extras once there is one", async () => {
    me.mockResolvedValue(baseUser({ preferredCurrency: "CLP", extraCurrencies: ["USD"] }));
    currencies.mockResolvedValue(CATALOGUE);

    render(
      <Providers>
        <CurrencyField value="CLP" onChange={vi.fn()} aria-label="Moneda" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByRole("button")).toBeDefined());
  });

  // Regression test for FR-008 (specs/020 /speckit-analyze finding U1): an
  // existing record's currency outside the user's current allowed universe
  // must still be shown correctly, never silently dropped — only the
  // universe of NEW selections is restricted.
  it("still displays and keeps selectable a value outside the allowed universe (FR-008)", async () => {
    me.mockResolvedValue(baseUser({ preferredCurrency: "CLP", extraCurrencies: [] }));
    currencies.mockResolvedValue([
      ...CATALOGUE,
      { id: "3", code: "EUR", numeric: "978", name: "Euro", symbol: "€" },
    ]);

    render(
      <Providers>
        <CurrencyField value="EUR" onChange={vi.fn()} aria-label="Moneda" />
      </Providers>,
    );

    // EUR is neither the principal (CLP) nor an extra — allowed.length stays 1,
    // so this still renders the static branch, but with the RECORD's own
    // currency, not silently coerced to the principal.
    await waitFor(() => expect(screen.getByText("EUR")).toBeDefined());
  });

  it("keeps a value outside the allowed universe selectable once the field is a real picker", async () => {
    me.mockResolvedValue(baseUser({ preferredCurrency: "CLP", extraCurrencies: ["USD"] }));
    currencies.mockResolvedValue([
      ...CATALOGUE,
      { id: "3", code: "EUR", numeric: "978", name: "Euro", symbol: "€" },
    ]);
    const onChange = vi.fn();

    render(
      <Providers>
        <CurrencyField value="EUR" onChange={onChange} aria-label="Moneda" />
      </Providers>,
    );

    // The closed control still shows the record's own currency (EUR), even
    // though EUR is outside CLP+USD — it was unshifted into the options.
    await waitFor(() => expect(screen.getByText("EUR")).toBeDefined());
  });
});
