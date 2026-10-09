import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { PROFILE_CHILD_ROUTES } from "./profileRoutes";
import { ProfileLayout } from "./ProfileLayout";

// jsdom measures nothing, so the profile's own width is set per test: wide = two panes.
const layout = vi.hoisted(() => ({ width: 1200 as number | null }));
vi.mock("../../../shared/lib/useElementWidth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/lib/useElementWidth")>()),
  useElementWidth: () => [() => {}, layout.width],
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
    countryId: null,
    countryName: null,
    phone: null,
    addressStreet: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    birthDate: null,
    age: null,
    identifierType: "RUT",
    identifierValue: "12.345.678-5",
    ...overrides,
  };
}

const me = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
  passkeyApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../api/sessionsApi", () => ({
  sessionsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../api/consentsApi", () => ({
  consentsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../api/profileApi", () => ({
  profileApi: { updateProfile: vi.fn(), updatePreferences: vi.fn() },
}));
vi.mock("../../accounts/api/accountsApi", () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../transactions/api/transactionsApi", () => ({
  transactionsApi: { summary: vi.fn().mockResolvedValue({ total: 0, currencyTotals: [] }) },
}));
vi.mock("../../reference/api/referenceApi", () => ({
  referenceApi: {
    countries: vi.fn().mockResolvedValue([]),
    currencies: vi.fn().mockResolvedValue([]),
  },
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: "/profile", element: <ProfileLayout />, children: PROFILE_CHILD_ROUTES }],
    { initialEntries: [path] },
  );
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

beforeEach(() => {
  layout.width = 1200;
  me.mockResolvedValue(mockUser());
});

describe("two panes or one column, by the profile's own width", () => {
  it("wide: the grouped section list beside the summary", async () => {
    renderAt("/profile");
    const nav = await screen.findByRole("navigation", { name: i18n.t("profile.nav.label") });
    expect(
      within(nav)
        .getByRole("link", { name: /Resumen/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: i18n.t("profile.sections.summary.title"),
      }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("region", { name: i18n.t("profile.summary.quick.title") }),
    ).toBeTruthy();
  });

  it("narrow: the start view shows identity, the summary without quick settings, and the list", async () => {
    layout.width = 600;
    renderAt("/profile");
    expect(await screen.findByText("Ana Soto")).toBeTruthy();
    expect(
      await screen.findByRole("region", { name: i18n.t("profile.summary.protection.title") }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("region", { name: i18n.t("profile.summary.data.title") }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: i18n.t("profile.summary.quick.title") }),
    ).toBeNull();
    const nav = screen.getByRole("navigation", { name: i18n.t("profile.nav.label") });
    expect(
      within(nav).getByRole("link", {
        name: new RegExp(i18n.t("profile.sections.security.title")),
      }),
    ).toBeTruthy();
  });

  it("narrow: a section is its own screen, with a way back to the start view", async () => {
    layout.width = 600;
    const router = renderAt("/profile/security");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: i18n.t("profile.sections.security.title"),
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: i18n.t("profile.nav.label") })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: i18n.t("profile.nav.back") }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile"));
  });
});

describe("leaving a section with an unsaved edit", () => {
  async function startEditingPhone() {
    fireEvent.click(await screen.findByText(i18n.t("profile.edit.phone")));
    return screen.findByLabelText(i18n.t("profile.edit.phone"));
  }
  const securityLink = () =>
    screen.getByRole("link", { name: new RegExp(i18n.t("profile.sections.security.title")) });

  it("asks before discarding; 'keep editing' keeps what was typed", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const router = renderAt("/profile/personal");
    const input = await startEditingPhone();
    fireEvent.change(input, { target: { value: "912345678" } });

    fireEvent.click(securityLink());
    expect(await screen.findByText(i18n.t("profile.discard.title"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.discard.cancel") }));
    await waitFor(() => expect(screen.queryByText(i18n.t("profile.discard.title"))).toBeNull());
    expect(router.state.location.pathname).toBe("/profile/personal");
    expect((screen.getByLabelText(i18n.t("profile.edit.phone")) as HTMLInputElement).value).toBe(
      "912345678",
    );

    fireEvent.click(securityLink());
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("profile.discard.confirm") }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile/security"));
    // A reload or a closed tab discards without asking (clarification 2): no beforeunload.
    expect(addListener.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
    addListener.mockRestore();
  });

  it("navigates straight away when nothing was changed", async () => {
    const router = renderAt("/profile/personal");
    await startEditingPhone();
    fireEvent.click(securityLink());
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile/security"));
    expect(screen.queryByText(i18n.t("profile.discard.title"))).toBeNull();
  });
});

describe("profile routes", () => {
  it.each([
    ["/profile/personal", "profile.sections.personal.title"],
    ["/profile/security", "profile.sections.security.title"],
    ["/profile/preferences", "profile.sections.preferences.title"],
    ["/profile/privacy", "profile.sections.privacy.title"],
  ])("%s opens its own section", async (path, titleKey) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: i18n.t(titleKey) })).toBeTruthy();
  });

  it("an unknown section address lands on /profile", async () => {
    const router = renderAt("/profile/no-existe");
    await waitFor(() => expect(router.state.location.pathname).toBe("/profile"));
  });
});

describe("summary actions lead to the exact place that resolves them", () => {
  it("'Activar dos pasos' opens the two-step block of Security", async () => {
    const router = renderAt("/profile");
    fireEvent.click(
      await screen.findByRole("link", {
        name: i18n.t("profile.summary.protection.actions.twoFactor"),
      }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/profile/security");
      expect(router.state.location.hash).toBe("#two-factor");
    });
  });

  it("'Agregar teléfono' opens the phone row of Personal information, then drops the parameter", async () => {
    const router = renderAt("/profile");
    fireEvent.click(
      await screen.findByRole("link", { name: i18n.t("profile.summary.data.add.phone") }),
    );
    expect(await screen.findByLabelText(i18n.t("profile.edit.phone"))).toBeTruthy();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/profile/personal");
      expect(router.state.location.search).toBe("");
    });
  });

  it("'Revisar sesiones' opens the sessions block of Security", async () => {
    const router = renderAt("/profile");
    fireEvent.click(
      await screen.findByRole("link", { name: i18n.t("profile.summary.sessions.review") }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/profile/security");
      expect(router.state.location.hash).toBe("#sessions");
    });
  });
});

describe("an honest profile: no inert controls, no promises", () => {
  const SECTIONS = [
    "/profile",
    "/profile/personal",
    "/profile/security",
    "/profile/preferences",
    "/profile/privacy",
  ];

  it.each(SECTIONS)(
    "%s has no notification, export or backup controls, and no SMS promise",
    async (path) => {
      renderAt(path);
      await screen.findByRole("heading", { level: 1 });
      for (const name of [/notificaci/i, /exportar/i, /respaldo/i]) {
        expect(screen.queryByRole("switch", { name })).toBeNull();
        expect(screen.queryByRole("button", { name })).toBeNull();
      }
      expect(document.body.textContent).not.toMatch(/SMS/);
    },
  );

  it("lists what isn't available yet as text only", async () => {
    renderAt("/profile");
    expect(await screen.findByText(i18n.t("profile.comingSoon.list"))).toBeTruthy();
  });

  it("'Eliminar cuenta' lives only in Data and privacy", async () => {
    renderAt("/profile/privacy");
    expect(
      await screen.findByRole("button", { name: i18n.t("profile.danger.deactivate") }),
    ).toBeTruthy();
  });

  it.each(["/profile", "/profile/personal", "/profile/security", "/profile/preferences"])(
    "%s doesn't offer 'Eliminar cuenta'",
    async (path) => {
      renderAt(path);
      await screen.findByRole("heading", { level: 1 });
      expect(
        screen.queryByRole("button", { name: i18n.t("profile.danger.deactivate") }),
      ).toBeNull();
    },
  );

  it("Preferences offers Light, Dark and System, and picking System follows the device", async () => {
    renderAt("/profile/preferences");
    const group = await screen.findByRole("group", { name: i18n.t("theme.label") });
    const system = within(group).getByRole("button", { name: i18n.t("theme.system") });
    expect(within(group).getByRole("button", { name: i18n.t("theme.light") })).toBeTruthy();
    expect(within(group).getByRole("button", { name: i18n.t("theme.dark") })).toBeTruthy();
    fireEvent.click(system);
    expect(system.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("finance.theme")).toBe("system");
  });
});
