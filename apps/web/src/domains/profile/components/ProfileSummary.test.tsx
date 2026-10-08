import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { ProfileSummary } from "./ProfileSummary";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

const listPasskeys = vi.fn();
vi.mock("../../auth/api/passkeyApi", () => ({
  passkeyApi: { list: (...args: unknown[]) => listPasskeys(...args) },
}));

const listSessions = vi.fn();
vi.mock("../api/sessionsApi", () => ({
  sessionsApi: { list: (...args: unknown[]) => listSessions(...args) },
}));

const updatePreferences = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: { updatePreferences: (...args: unknown[]) => updatePreferences(...args) },
}));

const passkeySupport = vi.hoisted(() => ({ supported: true }));
vi.mock("../../../shared/lib/webauthn", () => ({
  isPasskeySupported: () => passkeySupport.supported,
}));

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "ana@correo.cl",
    name: "Ana Soto",
    preferredCurrency: "CLP",
    extraCurrencies: [],
    locale: "es",
    theme: "dark",
    hideBalances: false,
    memberSinceYear: 2026,
    mfaEnabled: false,
    mfaRecoveryCodesRemaining: 0,
    phone: null,
    identifierType: "RUT",
    identifierValue: "12.345.678-5",
    ...overrides,
  };
}

function session(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    deviceLabel: `Device ${id}`,
    country: "CL",
    city: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    lastUsedAt: "2026-10-01T08:00:00.000Z",
    closedAt: null,
    isCurrent: false,
    ...overrides,
  };
}

function renderSummary(props: { showQuickSettings?: boolean } = {}) {
  const router = createMemoryRouter(
    [
      { path: "/profile", element: <ProfileSummary {...props} /> },
      { path: "*", element: <p>other page</p> },
    ],
    { initialEntries: ["/profile"] },
  );
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

const region = (titleKey: string) => screen.findByRole("region", { name: i18n.t(titleKey) });

beforeEach(() => {
  passkeySupport.supported = true;
  me.mockResolvedValue(mockUser());
  listPasskeys.mockResolvedValue([{ id: "pk1" }]);
  listSessions.mockResolvedValue([session("me", { isCurrent: true })]);
  updatePreferences.mockResolvedValue(mockUser());
});

describe("ProfileSummary — protection", () => {
  it("reads 2 of 3 with two-step pending as the next step", async () => {
    renderSummary();
    const card = await region("profile.summary.protection.title");
    expect(
      await within(card).findByText(i18n.t("profile.summary.protection.progress", { done: 2 })),
    ).toBeTruthy();
    expect(
      within(card).getByRole("link", {
        name: i18n.t("profile.summary.protection.actions.twoFactor"),
      }),
    ).toBeTruthy();
  });

  it("says the protection is complete, with no next step, when all three are done", async () => {
    me.mockResolvedValue(mockUser({ mfaEnabled: true }));
    renderSummary();
    const card = await region("profile.summary.protection.title");
    expect(
      await within(card).findByText(i18n.t("profile.summary.protection.complete")),
    ).toBeTruthy();
    expect(within(card).queryByRole("link")).toBeNull();
  });

  it("marks the passkey as not available here and moves the next step to two-step", async () => {
    passkeySupport.supported = false;
    listPasskeys.mockResolvedValue([]);
    renderSummary();
    const card = await region("profile.summary.protection.title");
    expect(
      await within(card).findByText(i18n.t("profile.summary.protection.notAvailable")),
    ).toBeTruthy();
    expect(
      within(card).getByRole("link", {
        name: i18n.t("profile.summary.protection.actions.twoFactor"),
      }),
    ).toBeTruthy();
  });
});

describe("ProfileSummary — your details", () => {
  it("reads 2 of 3 and offers adding the phone", async () => {
    renderSummary();
    const card = await region("profile.summary.data.title");
    expect(
      await within(card).findByText(i18n.t("profile.summary.data.progress", { done: 2 })),
    ).toBeTruthy();
    expect(
      within(card).getByRole("link", { name: i18n.t("profile.summary.data.add.phone") }),
    ).toBeTruthy();
  });
});

describe("ProfileSummary — sessions", () => {
  it("lists the current session and three at most, with the rest counted", async () => {
    listSessions.mockResolvedValue([
      session("me", { isCurrent: true }),
      session("a", { lastUsedAt: "2026-10-05T08:00:00.000Z" }),
      session("b", { lastUsedAt: "2026-10-04T08:00:00.000Z" }),
      session("c", { lastUsedAt: "2026-10-03T08:00:00.000Z" }),
      session("d", { lastUsedAt: "2026-10-02T08:00:00.000Z" }),
    ]);
    renderSummary();
    const card = await region("profile.summary.sessions.title");
    expect(await within(card).findByText("Device me")).toBeTruthy();
    expect(within(card).getByText("Device a")).toBeTruthy();
    expect(within(card).getByText("Device b")).toBeTruthy();
    expect(within(card).queryByText("Device c")).toBeNull();
    expect(
      within(card).getByText(i18n.t("profile.summary.sessions.more", { count: 2 })),
    ).toBeTruthy();
    expect(within(card).getByText(i18n.t("profile.summary.sessions.current"))).toBeTruthy();
  });

  it("shows a retry instead of sessions when they fail to load", async () => {
    listSessions.mockRejectedValue(new Error("offline"));
    renderSummary();
    const card = await region("profile.summary.sessions.title");
    expect(
      await within(card).findByRole("button", { name: i18n.t("common.retry") }, { timeout: 4000 }),
    ).toBeTruthy();
  });
});

describe("ProfileSummary — quick settings", () => {
  it("switches the theme and hides balances from the summary itself", async () => {
    renderSummary();
    const card = await region("profile.summary.quick.title");
    const system = within(card).getByRole("button", { name: i18n.t("theme.system") });
    fireEvent.click(system);
    expect(system.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(
      within(card).getByRole("switch", { name: i18n.t("profile.financial.hideBalances") }),
    );
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ hideBalances: true }));
  });

  it("can leave the quick settings out while keeping protection, details and sessions", async () => {
    renderSummary({ showQuickSettings: false });
    expect(await region("profile.summary.protection.title")).toBeTruthy();
    expect(await region("profile.summary.data.title")).toBeTruthy();
    expect(await region("profile.summary.sessions.title")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: i18n.t("profile.summary.quick.title") }),
    ).toBeNull();
  });
});
