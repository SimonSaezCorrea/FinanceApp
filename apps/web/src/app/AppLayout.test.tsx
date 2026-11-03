import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { latestVersion } from "@finance/release-notes/src/lazy";

import i18n from "../i18n";
import { AppLayout } from "./AppLayout";

const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
const viewport = vi.hoisted(() => ({ large: true }));

vi.mock("../domains/auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: auth.user, logout: vi.fn() }),
}));
vi.mock("../domains/profile/components/ThemeSync", () => ({ ThemeSync: () => null }));
vi.mock("../domains/transactions/components/TransactionCreateModal", () => ({
  TransactionCreateModal: () => null,
}));
vi.mock("@finance/ui/src/shared/lib/useMediaQuery", () => ({
  useMediaQuery: () => viewport.large,
}));

function renderLayout() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <AppLayout>
          <p>content</p>
        </AppLayout>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const user = (seen: string | null) => ({
  name: "Ana",
  email: "ana@test.local",
  emailVerified: true,
  releaseNotesSeenVersion: seen,
});

describe("AppLayout · Novedades (spec 038)", () => {
  beforeEach(() => {
    viewport.large = true;
    globalThis.localStorage?.clear();
  });

  it("links to Novedades and says there is something new until the newest was seen", () => {
    auth.user = user(null);
    renderLayout();
    const link = screen.getByRole("link", { name: /Novedades/ });
    expect(link.getAttribute("href")).toBe("/whats-new");
    expect(link.textContent).toContain("hay novedades");
  });

  it("drops the dot once the newest version was seen (on any device: it comes from the account)", () => {
    auth.user = user(latestVersion());
    renderLayout();
    const link = screen.getByRole("link", { name: /Novedades/ });
    expect(link.textContent).not.toContain("hay novedades");
  });

  it("an API that predates it (no field) still shows the dot", () => {
    auth.user = { name: "Ana", email: "ana@test.local", emailVerified: true };
    renderLayout();
    expect(screen.getByRole("link", { name: /Novedades/ }).textContent).toContain("hay novedades");
  });
});
