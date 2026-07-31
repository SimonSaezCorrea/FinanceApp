import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import i18n from "../../../i18n";
import { DangerZone } from "./DangerZone";

const deactivate = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: { deactivate: (...args: unknown[]) => deactivate(...args) },
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

function renderDangerZone() {
  return render(
    <Providers>
      <MemoryRouter>
        <DangerZone />
      </MemoryRouter>
    </Providers>,
  );
}

describe("DangerZone — deactivate account (US5)", () => {
  it("requires re-entering the password and shows an error on an incorrect one", async () => {
    deactivate.mockRejectedValue(new ApiRequestError("INVALID_CURRENT_PASSWORD", 401));
    renderDangerZone();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.deactivate") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.danger.passwordLabel")), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.confirmButton") }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t("errors.INVALID_CURRENT_PASSWORD"))).toBeDefined(),
    );
    expect(deactivate).toHaveBeenCalledWith({ password: "wrong" });
  });

  it("deactivates the account and ends the session on a correct password", async () => {
    deactivate.mockResolvedValue(undefined);
    renderDangerZone();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.deactivate") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.danger.passwordLabel")), {
      target: { value: "correct-pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.confirmButton") }));

    await waitFor(() => expect(deactivate).toHaveBeenCalledWith({ password: "correct-pw" }));
  });
});
