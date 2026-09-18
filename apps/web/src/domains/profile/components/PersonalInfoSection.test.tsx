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

async function openSection() {
  fireEvent.click(
    await screen.findByRole("button", { name: i18n.t("profile.personalInfo.title") }),
  );
}

/** Opens ONE row by clicking it — each row is its own editor now. */
async function openRow(currentValue: string) {
  await openSection();
  fireEvent.click(await screen.findByText(currentValue));
}

describe("PersonalInfoSection", () => {
  beforeEach(() => updateProfile.mockClear());

  it("shows the not-specified fallback when nothing is set", async () => {
    me.mockResolvedValue(mockUser());
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    await openSection();
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
    await openSection();
    await waitFor(() => expect(screen.getByText("Chile")).toBeDefined());
    // The address reads as one datum, joined — not as four boxes.
    expect(screen.getByText("Av. Siempre Viva 742, Santiago")).toBeDefined();
    expect(screen.getByText(/RUT: 12\.345\.678-5/)).toBeDefined();
  });

  it("opens one row, saves only that field, and confirms on the row", async () => {
    me.mockResolvedValue(mockUser({ name: "Ana" }));
    updateProfile.mockResolvedValue(mockUser({ name: "Ana Bravo" }));
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    await openRow("Ana");

    const name = await screen.findByLabelText(i18n.t("profile.edit.name"));
    fireEvent.change(name, { target: { value: "Ana Bravo" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    // Only this row's own field travels — no other row is even open.
    expect(updateProfile).toHaveBeenCalledWith({ name: "Ana Bravo" });
    expect(await screen.findByText(i18n.t("profile.edit.saved"))).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter saves the open row without reaching for the button", async () => {
    me.mockResolvedValue(mockUser({ name: "Ana" }));
    updateProfile.mockResolvedValue(mockUser({ name: "Ana Bravo" }));
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    await openRow("Ana");

    const name = await screen.findByLabelText(i18n.t("profile.edit.name"));
    fireEvent.change(name, { target: { value: "Ana Bravo" } });
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: "Ana Bravo" }));
  });

  it("cancelling the open row persists nothing and restores the value", async () => {
    me.mockResolvedValue(mockUser({ name: "Ana" }));
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    await openRow("Ana");

    fireEvent.change(await screen.findByLabelText(i18n.t("profile.edit.name")), {
      target: { value: "Ana Bravo" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.cancel") }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Ana")).toBeDefined();
  });

  it("a composite datum opens every part in the same row, and saves them together", async () => {
    me.mockResolvedValue(
      mockUser({ addressStreet: "Av. Siempre Viva 742", addressCity: "Santiago" }),
    );
    updateProfile.mockResolvedValue(mockUser());
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    await openRow("Av. Siempre Viva 742, Santiago");

    fireEvent.change(await screen.findByLabelText(i18n.t("profile.edit.addressRegion")), {
      target: { value: "Región Metropolitana" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        addressStreet: "Av. Siempre Viva 742",
        addressCity: "Santiago",
        addressRegion: "Región Metropolitana",
        addressPostalCode: null,
      }),
    );
  });

  it("a bad RUT check digit blocks the save and names the problem", async () => {
    me.mockResolvedValue(mockUser({ identifierType: "RUT", identifierValue: "12.345.678-5" }));
    render(
      <Providers>
        <PersonalInfoSection />
      </Providers>,
    );
    await openRow("RUT: 12.345.678-5");

    fireEvent.change(await screen.findByLabelText(i18n.t("profile.edit.identifierValue")), {
      target: { value: "12.345.678-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toBe(i18n.t("profile.edit.invalidRut"));
  });

  it("opens straight into edit mode when the checklist asks for it", async () => {
    me.mockResolvedValue(mockUser({ phone: null }));
    render(
      <Providers>
        <PersonalInfoSection editRequest={{ field: "phone" }} />
      </Providers>,
    );

    // No click on the header: the request expanded the section AND opened that row.
    expect(await screen.findByLabelText(i18n.t("profile.edit.phone"))).toBeDefined();
  });
});
