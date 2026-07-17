import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { PersonalInfoSection } from "./PersonalInfoSection";

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
    theme: "dark",
    memberSinceYear: 2024,
    countryId: null,
    countryName: null,
    addressStreet: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    birthDate: null,
    age: null,
    identifierType: null,
    identifierValue: null,
    ...overrides,
  };
}

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

const updateProfile = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: { updateProfile: (...args: unknown[]) => updateProfile(...args) },
}));

describe("PersonalInfoSection", () => {
  beforeEach(() => updateProfile.mockClear());

  it("shows the not-specified fallback when nothing is set", async () => {
    me.mockResolvedValue(mockUser());
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.personalInfo.title") }));
    await waitFor(() =>
      expect(screen.getAllByText(i18n.t("profile.personalInfo.notSet")).length).toBeGreaterThan(0),
    );
  });

  it("renders country, address, and identifier once set", async () => {
    me.mockResolvedValue(
      mockUser({
        countryName: "Chile",
        addressStreet: "Av. Siempre Viva 742",
        addressCity: "Santiago",
        birthDate: "1990-05-14",
        age: 36,
        identifierType: "RUT",
        identifierValue: "12.345.678-5",
      }),
    );
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.personalInfo.title") }));
    await waitFor(() => expect(screen.getByText("Chile")).toBeDefined());
    expect(screen.getByText(/Av\. Siempre Viva 742/)).toBeDefined();
    expect(screen.getByText(/RUT: 12\.345\.678-5/)).toBeDefined();
  });

  it("edits a single field inline, without opening any dialog", async () => {
    me.mockResolvedValue(mockUser({ name: "Ana" }));
    updateProfile.mockResolvedValue(mockUser({ name: "Ana Bravo" }));
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.personalInfo.title") }));

    // Click the "Ana" row to enter inline edit mode (no dialog/modal involved).
    fireEvent.click(await screen.findByText("Ana"));
    const input = await screen.findByDisplayValue("Ana");
    fireEvent.change(input, { target: { value: "Ana Bravo" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.edit.save") }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: "Ana Bravo" }));
    // No dialog/modal ever rendered.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelling an inline edit does not persist anything and restores the display row", async () => {
    me.mockResolvedValue(mockUser({ name: "Ana" }));
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.personalInfo.title") }));

    fireEvent.click(await screen.findByText("Ana"));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.edit.cancel") }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Ana")).toBeDefined();
  });
});
