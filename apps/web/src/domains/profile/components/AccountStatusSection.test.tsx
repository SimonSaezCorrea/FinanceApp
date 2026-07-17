import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { AccountStatusSection } from "./AccountStatusSection";

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
    identifierValue: null,
    phone: null,
    ...overrides,
  };
}

describe("AccountStatusSection", () => {
  it("shows 25% complete when only email is set (identity/phone missing, photo never available)", async () => {
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <AccountStatusSection />
      </Providers>,
    );
    await waitFor(() => expect(screen.getByText("25%")).toBeDefined());
  });

  it("shows 75% complete once identity and phone are also set (photo can never reach 100% — no upload feature)", async () => {
    me.mockResolvedValue(baseUser({ identifierValue: "12.345.678-5", phone: "+56 9 1234 5678" }));
    render(
      <Providers>
        <AccountStatusSection />
      </Providers>,
    );
    await waitFor(() => expect(screen.getByText("75%")).toBeDefined());
  });

  it("photo action is disabled (no upload capability exists)", async () => {
    me.mockResolvedValue(baseUser());
    render(
      <Providers>
        <AccountStatusSection />
      </Providers>,
    );
    const photoButton = await screen.findByRole("button", {
      name: i18n.t("profile.accountStatus.action.photo"),
    });
    expect((photoButton as HTMLButtonElement).disabled).toBe(true);
  });
});
