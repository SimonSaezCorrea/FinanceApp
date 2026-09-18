import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      theme: "dark",
      memberSinceYear: 2024,
    }),
    logout: vi.fn(),
  },
}));

async function openDialog() {
  render(
    <Providers>
      <SecuritySection />
    </Providers>,
  );
  fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.title") })); // expand
  fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.change") }));
  return {
    current: await screen.findByLabelText(i18n.t("profile.security.password.current")),
    next: screen.getByLabelText(i18n.t("profile.security.password.new")),
    confirm: screen.getByLabelText(i18n.t("profile.security.password.confirm")),
  };
}

describe("SecuritySection — change password", () => {
  it("keeps Guardar disabled until the current, new and confirm fields are all valid", async () => {
    const { current, next, confirm } = await openDialog();
    const save = screen.getByRole("button", { name: i18n.t("profile.security.password.save") });
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.change(current, { target: { value: "oldpassword" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    expect(save.hasAttribute("disabled")).toBe(true); // confirm still empty

    fireEvent.change(confirm, { target: { value: "not-a-match" } });
    expect(save.hasAttribute("disabled")).toBe(true); // mismatched
    expect(screen.getByText(i18n.t("profile.security.password.matchMismatch"))).toBeDefined();

    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(i18n.t("profile.security.password.matchOk"))).toBeDefined();
  });

  it("anchors INVALID_CURRENT_PASSWORD to the current-password field, not the new one (regression)", async () => {
    changePassword.mockRejectedValue(new ApiRequestError("INVALID_CURRENT_PASSWORD", 401));
    const { current, next, confirm } = await openDialog();

    fireEvent.change(current, { target: { value: "wrong" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.save") }));

    const errorText = i18n.t("errors.INVALID_CURRENT_PASSWORD");
    await waitFor(() => expect(screen.getByText(errorText)).toBeDefined());

    // The old bug: this error rendered under "Nueva contraseña" instead.
    const newField = next.parentElement!.parentElement!;
    expect(within(newField).queryByText(errorText)).toBeNull();
    const currentField = current.parentElement!.parentElement!;
    expect(within(currentField).getByText(errorText)).toBeDefined();
  });

  it("shows a success toast and resets the fields after a successful change", async () => {
    changePassword.mockResolvedValue(undefined);
    const { current, next, confirm } = await openDialog();

    fireEvent.change(current, { target: { value: "oldpassword" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.save") }));

    await waitFor(() =>
      expect(
        screen.getAllByText(i18n.t("profile.security.password.updated")).length,
      ).toBeGreaterThan(0),
    );
  });
});
