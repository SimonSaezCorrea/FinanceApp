import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import i18n from "../../../i18n";
import type { SectionStatuses } from "../lib/profileStatus";
import { ProfileSectionNav } from "./ProfileSectionNav";

const statuses: SectionStatuses = {
  summary: { line: "2 pasos pendientes", pending: 2 },
  personal: { line: "Falta tu teléfono", pending: 1 },
  security: { line: "Dos pasos desactivada", pending: 1 },
  preferences: { line: "CLP · Español · Oscuro", pending: 0 },
  privacy: { line: "1 consentimiento vigente", pending: 0 },
};

function renderNav(variant: "panel" | "list", path = "/profile/security") {
  const router = createMemoryRouter(
    [{ path: "/profile/*", element: <ProfileSectionNav variant={variant} statuses={statuses} /> }],
    { initialEntries: [path] },
  );
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("ProfileSectionNav", () => {
  it("lists the groups in order, each with its sections", () => {
    renderNav("panel");
    const nav = screen.getByRole("navigation", { name: i18n.t("profile.nav.label") });
    const headings = within(nav)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(headings).toEqual([
      i18n.t("profile.groups.account"),
      i18n.t("profile.groups.app"),
      i18n.t("profile.groups.privacy"),
    ]);
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/profile",
      "/profile/personal",
      "/profile/security",
      "/profile/preferences",
      "/profile/privacy",
    ]);
  });

  it("shows each section's status line, with a pending count only where action is needed", () => {
    renderNav("panel");
    const security = screen.getByRole("link", {
      name: new RegExp(i18n.t("profile.sections.security.title")),
    });
    expect(within(security).getByText("Dos pasos desactivada")).toBeTruthy();
    expect(within(security).getByText("1")).toBeTruthy();
    const preferences = screen.getByRole("link", {
      name: new RegExp(i18n.t("profile.sections.preferences.title")),
    });
    expect(within(preferences).getByText("CLP · Español · Oscuro")).toBeTruthy();
    expect(within(preferences).queryByText("0")).toBeNull();
  });

  it("marks the open section as the current page and keeps every row at least 44px tall", () => {
    renderNav("panel");
    const links = screen.getAllByRole("link");
    expect(links.filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(
      screen
        .getByRole("link", { name: new RegExp(i18n.t("profile.sections.security.title")) })
        .getAttribute("aria-current"),
    ).toBe("page");
    for (const link of links) expect(link.className).toMatch(/min-h-1[1-6]/);
  });

  it("as the phone's list leaves out the summary, which the start view already shows", () => {
    renderNav("list", "/profile");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).not.toContain("/profile");
    expect(links).toHaveLength(4);
  });
});
