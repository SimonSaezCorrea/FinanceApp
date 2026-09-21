import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import i18n from "../../../i18n";
import { DangerZone } from "./DangerZone";

const deleteAccount = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: { deleteAccount: (...args: unknown[]) => deleteAccount(...args) },
}));
vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
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

describe("DangerZone — delete account (Ley 21.719 Art. 11 supresión)", () => {
  it("requires re-entering the password and shows an error on an incorrect one", async () => {
    deleteAccount.mockRejectedValue(new ApiRequestError("INVALID_CURRENT_PASSWORD", 401));
    renderDangerZone();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.deactivate") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.danger.passwordLabel")), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.confirmButton") }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t("errors.INVALID_CURRENT_PASSWORD"))).toBeDefined(),
    );
    expect(deleteAccount).toHaveBeenCalledWith({ password: "wrong", keepHistory: false });
  });

  it("defaults to keepHistory=false (hard delete) when the switch is left untouched", async () => {
    deleteAccount.mockResolvedValue(undefined);
    renderDangerZone();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.deactivate") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.danger.passwordLabel")), {
      target: { value: "correct-pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.confirmButton") }));

    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith({ password: "correct-pw", keepHistory: false }),
    );
  });

  it("sends keepHistory=true once the 'keep my history' switch is turned on", async () => {
    deleteAccount.mockResolvedValue(undefined);
    renderDangerZone();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.deactivate") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.danger.passwordLabel")), {
      target: { value: "correct-pw" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: i18n.t("profile.danger.keepHistoryLabel") }),
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.danger.confirmButton") }));

    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith({ password: "correct-pw", keepHistory: true }),
    );
  });
});
