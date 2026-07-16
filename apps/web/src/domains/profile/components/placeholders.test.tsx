import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { NotificationsSection } from "./NotificationsSection";
import { SecuritySection } from "./SecuritySection";

vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
      dateFormat: "DD/MM/YYYY",
      theme: "dark",
      memberSinceYear: 2024,
    }),
    logout: vi.fn(),
  },
}));

function renderWithProviders(ui: React.ReactNode) {
  return render(<Providers>{ui}</Providers>);
}

describe("Profile placeholders (FR-008)", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  afterEach(() => fetchSpy.mockClear());

  it("toggling the 2FA switch flips visually but calls no network request", async () => {
    renderWithProviders(<SecuritySection />);
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.security.title") }));
    const el = await waitFor(() =>
      screen.getByRole("switch", { name: i18n.t("profile.security.twoFactor.label") }),
    );
    expect(el.getAttribute("aria-checked")).toBe("false");
    fetchSpy.mockClear(); // ignore the initial /auth/me the Providers tree issues on mount
    fireEvent.click(el);
    expect(el.getAttribute("aria-checked")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("toggling any notification switch calls no network request", async () => {
    renderWithProviders(<NotificationsSection />);
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.notifications.title") }));
    const el = await waitFor(() =>
      screen.getByRole("switch", { name: i18n.t("profile.notifications.spendAlerts") }),
    );
    fetchSpy.mockClear();
    fireEvent.click(el);
    expect(el.getAttribute("aria-checked")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
