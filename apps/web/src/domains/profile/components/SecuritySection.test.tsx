import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import i18n from "../../../i18n";
import { SecuritySection } from "./SecuritySection";

const changePassword = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: {
    changePassword: (...args: unknown[]) => changePassword(...args),
  },
}));
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

describe("SecuritySection — change password (US3)", () => {
  it("shows INVALID_CURRENT_PASSWORD and keeps the dialog open on a wrong current password", async () => {
    changePassword.mockRejectedValue(new ApiRequestError("INVALID_CURRENT_PASSWORD", 401));
    render(
      <Providers>
        <SecuritySection />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.title") })); // expand
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.change") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.security.password.current")), {
      target: { value: "wrong" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("profile.security.password.new")), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.save") }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t("errors.INVALID_CURRENT_PASSWORD"))).toBeDefined(),
    );
  });
});
