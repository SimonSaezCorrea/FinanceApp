import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { MaskedAmount } from "./MaskedAmount";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
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
    ...overrides,
  };
}

describe("MaskedAmount", () => {
  it("renders the real content when hideBalances is off", async () => {
    me.mockResolvedValue(baseUser({ hideBalances: false }));
    render(
      <Providers>
        <MaskedAmount>$1.000.000</MaskedAmount>
      </Providers>,
    );
    await waitFor(() => expect(screen.getByText("$1.000.000")).toBeDefined());
  });

  it("renders a mask instead of the amount when hideBalances is on", async () => {
    me.mockResolvedValue(baseUser({ hideBalances: true }));
    render(
      <Providers>
        <MaskedAmount>$1.000.000</MaskedAmount>
      </Providers>,
    );
    await waitFor(() => expect(screen.queryByText("$1.000.000")).toBeNull());
    expect(screen.getByText("••••••")).toBeDefined();
  });
});
