import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows an eye icon affordance that flips between Eye and EyeOff", async () => {
    me.mockResolvedValue(baseUser({ hideBalances: true }));
    render(
      <Providers>
        <MaskedAmount>$1.000.000</MaskedAmount>
      </Providers>,
    );
    const button = await screen.findByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.querySelector("svg")).not.toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("never triggers a wrapping element's own click handler (e.g. a card's link to its detail route)", async () => {
    me.mockResolvedValue(baseUser({ hideBalances: true }));
    const outerClick = vi.fn();
    render(
      <Providers>
        <div onClick={outerClick}>
          <MaskedAmount>$1.000.000</MaskedAmount>
        </div>
      </Providers>,
    );
    const button = await screen.findByRole("button");
    fireEvent.click(button);
    expect(screen.getByText("$1.000.000")).toBeDefined();
    expect(outerClick).not.toHaveBeenCalled();
  });

  it("reveals the real value on click, and re-masks on a second click", async () => {
    me.mockResolvedValue(baseUser({ hideBalances: true }));
    render(
      <Providers>
        <MaskedAmount>$1.000.000</MaskedAmount>
      </Providers>,
    );
    await waitFor(() => expect(screen.getByText("••••••")).toBeDefined());

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("$1.000.000")).toBeDefined();
    expect(screen.queryByText("••••••")).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("••••••")).toBeDefined();
    expect(screen.queryByText("$1.000.000")).toBeNull();
  });

  it("reveals each instance independently — revealing one never affects another", async () => {
    me.mockResolvedValue(baseUser({ hideBalances: true }));
    render(
      <Providers>
        <div>
          <MaskedAmount>$1.000</MaskedAmount>
          <MaskedAmount>$2.000</MaskedAmount>
        </div>
      </Providers>,
    );
    const buttons = await screen.findAllByRole("button");
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]!);
    expect(screen.getByText("$1.000")).toBeDefined();
    // The second amount stays masked.
    expect(screen.queryByText("$2.000")).toBeNull();
    expect(screen.getAllByText("••••••")).toHaveLength(1);
  });
});
