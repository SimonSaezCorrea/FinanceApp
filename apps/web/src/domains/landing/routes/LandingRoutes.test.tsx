import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { HomeRoute } from "../../../app/HomeRoute";
import { NotFoundRoute } from "../../../app/NotFoundRoute";
import { RequireAuth } from "../../auth/components/RequireAuth";
import { AuthRedirectRoute } from "../../auth/routes/AuthRedirectRoute";
import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { AboutRoute } from "./AboutRoute";
import { FaqRoute } from "./FaqRoute";
import { PricingRoute } from "./PricingRoute";
import { PrivacyRoute } from "./PrivacyRoute";

const login = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockRejectedValue(new Error("not signed in")),
    login: (...args: unknown[]) => login(...args),
    logout: vi.fn(),
  },
}));

// jsdom has no scrolling; a page change calls window.scrollTo.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Providers>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/nosotros" element={<AboutRoute />} />
          <Route path="/privacidad" element={<PrivacyRoute />} />
          <Route path="/precios" element={<PricingRoute />} />
          <Route path="/preguntas" element={<FaqRoute />} />
          <Route path="/login" element={<AuthRedirectRoute mode="login" />} />
          <Route path="/register" element={<AuthRedirectRoute mode="register" />} />
          <Route
            path="/accounts"
            element={
              <RequireAuth>
                <p>protected accounts page</p>
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </Providers>
    </MemoryRouter>,
  );
}

describe("public landing", () => {
  it("'/' shows the landing to a visitor instead of redirecting to /login", async () => {
    renderAt("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: /reglas de tu banco/ }),
    ).toBeTruthy();
  });

  it("'Iniciar sesión' opens the access panel with the real login form", async () => {
    renderAt("/");
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.signIn") }));
    expect(await screen.findByLabelText(i18n.t("auth.rut"))).toBeTruthy();
    expect(screen.getByRole("heading", { name: i18n.t("auth.login.title") })).toBeTruthy();
  });

  it("below the hero the home goes why → features", async () => {
    renderAt("/");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.id)).toEqual([
      "landing-why-title",
      "landing-features-title",
    ]);
  });

  it("/nosotros lists three numbered rules and an honest status board", async () => {
    renderAt("/nosotros");
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(
      ["noInvented", "reversible", "chileFirst"].map((key) =>
        i18n.t(`landing.about.principles.${key}.title`),
      ),
    );
    for (const key of ["available", "paused", "pending"]) {
      expect(screen.getByText(i18n.t(`landing.about.today.${key}.title`))).toBeTruthy();
    }
  });

  it("/privacidad goes layer by layer, each with its two details", async () => {
    renderAt("/privacidad");
    const layers = await screen.findByRole("region", {
      name: i18n.t("landing.privacy.layersTitle"),
    });
    const keys = ["consent", "access", "sessions", "visible", "leave"];
    expect(
      within(layers)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(keys.map((key) => i18n.t(`landing.privacy.layers.${key}.title`)));
    // Receipts belong to "lo justo a la vista", not to sessions.
    const visible = within(layers)
      .getByRole("heading", { name: i18n.t("landing.privacy.layers.visible.title") })
      .closest("li") as HTMLElement;
    expect(
      within(visible).getByText(i18n.t("landing.privacy.layers.visible.b.title")),
    ).toBeTruthy();
  });

  it("/precios shows only the free plan — no paid plan is promised", async () => {
    renderAt("/precios");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(i18n.t("landing.pricing.free"))).toBeTruthy();
    expect(screen.queryByText(/cumbre|premium|pro|próximamente/i)).toBeNull();
  });

  it("/preguntas indexes its topics and starts with every question closed", async () => {
    renderAt("/preguntas");
    await screen.findByRole("heading", { level: 1 });
    const topics = screen.getByRole("navigation", { name: i18n.t("landing.faq.topics") });
    expect(within(topics).getAllByRole("link")).toHaveLength(3);
    for (const details of document.querySelectorAll("details")) expect(details.open).toBe(false);
    expect(i18n.t("landing.faq.items.bankSync.a")).toMatch(/^Hoy no/);
  });

  it("an unknown URL shows the not-found page inside the landing", async () => {
    renderAt("/producto/cuotas");
    expect(
      await screen.findByRole("heading", { level: 1, name: i18n.t("app.notFound.title") }),
    ).toBeTruthy();
    expect(screen.getByText("/producto/cuotas")).toBeTruthy();
    expect(screen.getByRole("link", { name: i18n.t("app.notFound.toHome") })).toBeTruthy();
    // Landing chrome stays: the visitor can still sign in from here.
    expect(screen.getByRole("button", { name: i18n.t("auth.signIn") })).toBeTruthy();
  });

  it("/register opens the panel on the sign-up view", async () => {
    renderAt("/register");
    expect(await screen.findByLabelText(i18n.t("auth.birthDate"))).toBeTruthy();
    expect(screen.getByRole("heading", { name: i18n.t("auth.signup.title") })).toBeTruthy();
  });

  it("the RUT typed in the login view is kept when switching to sign-up", async () => {
    renderAt("/login");
    fireEvent.change(await screen.findByLabelText(i18n.t("auth.rut")), {
      target: { value: "123456785" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));
    await screen.findByLabelText(i18n.t("auth.birthDate"));
    expect((screen.getByLabelText(i18n.t("auth.rut")) as HTMLInputElement).value).toBe(
      "12.345.678-5",
    );
  });

  it("a signed-out visit to a protected page signs in and lands back on it", async () => {
    login.mockResolvedValue({
      mfaRequired: false,
      user: { id: "u1", email: "a@b.com", mfaEnabled: false, mfaRecoveryCodesRemaining: 0 },
    });
    renderAt("/accounts");

    fireEvent.change(await screen.findByLabelText(i18n.t("auth.rut")), {
      target: { value: "12.345.678-5" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.password")), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.signIn") }));

    expect(await screen.findByText("protected accounts page")).toBeTruthy();
  });
});
