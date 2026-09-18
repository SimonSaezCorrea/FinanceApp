import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { useAllowedCurrencies } from "./useAllowedCurrencies";

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
  { id: "3", code: "CLF", numeric: "990", name: "Unidad de Fomento", symbol: null },
];

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <Providers>{children}</Providers>;
}

describe("useAllowedCurrencies", () => {
  it("returns only the principal currency when there are no extras", async () => {
    me.mockResolvedValue(baseUser({ preferredCurrency: "CLP", extraCurrencies: [] }));
    currencies.mockResolvedValue(CATALOGUE);

    const { result } = renderHook(() => useAllowedCurrencies(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current).toEqual([{ code: "CLP", name: "Peso chileno" }]);
  });

  it("puts the principal currency first, then the extras", async () => {
    me.mockResolvedValue(baseUser({ preferredCurrency: "CLP", extraCurrencies: ["USD", "CLF"] }));
    currencies.mockResolvedValue(CATALOGUE);

    const { result } = renderHook(() => useAllowedCurrencies(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((c) => c.code)).toEqual(["CLP", "USD", "CLF"]);
  });
});
