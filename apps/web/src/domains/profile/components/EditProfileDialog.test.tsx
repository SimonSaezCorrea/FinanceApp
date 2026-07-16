import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import i18n from "../../../i18n";
import { EditProfileDialog } from "./EditProfileDialog";

const updateProfile = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: {
    updateProfile: (...args: unknown[]) => updateProfile(...args),
  },
}));
vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "ana@b.com",
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

describe("EditProfileDialog", () => {
  afterEach(() => updateProfile.mockClear());

  it("shows the EMAIL_TAKEN error and does not close on a duplicate email", async () => {
    updateProfile.mockRejectedValue(new ApiRequestError("EMAIL_TAKEN", 409, "email"));
    const onOpenChange = vi.fn();
    render(
      <Providers>
        <EditProfileDialog open onOpenChange={onOpenChange} />
      </Providers>,
    );

    const emailInput = await waitFor(() => screen.getByLabelText(i18n.t("profile.edit.email")));
    fireEvent.change(emailInput, { target: { value: "taken@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.edit.save") }));

    await waitFor(() => expect(screen.getByText(i18n.t("errors.EMAIL_TAKEN"))).toBeDefined());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("saves a valid rename and closes the dialog", async () => {
    updateProfile.mockResolvedValue({
      id: "u1",
      email: "ana@b.com",
      name: "New Name",
      preferredCurrency: "CLP",
      locale: "es",
      dateFormat: "DD/MM/YYYY",
      theme: "dark",
      memberSinceYear: 2024,
    });
    const onOpenChange = vi.fn();
    render(
      <Providers>
        <EditProfileDialog open onOpenChange={onOpenChange} />
      </Providers>,
    );

    const nameInput = await waitFor(() => screen.getByLabelText(i18n.t("profile.edit.name")));
    const emailInput = screen.getByLabelText(i18n.t("profile.edit.email"));
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    fireEvent.change(emailInput, { target: { value: "ana@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.edit.save") }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Name" }),
    );
  });
});
