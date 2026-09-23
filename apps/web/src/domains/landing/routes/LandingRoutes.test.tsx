import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { HomeRoute } from "../../../app/HomeRoute";
import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { ProductRoute } from "./ProductRoute";

vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockRejectedValue(new Error("not signed in")),
    login: vi.fn(),
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
          <Route path="/producto/:view?" element={<ProductRoute />} />
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
    expect(screen.getByText(i18n.t("landing.auth.cashTitle"))).toBeTruthy();
  });

  it("each product view has its own URL and tab", async () => {
    renderAt("/producto/cuotas");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: i18n.t("landing.product.installments.title"),
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: i18n.t("landing.product.savings.title") }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: i18n.t("landing.product.savings.title") }),
      ).toBeTruthy(),
    );
  });
});
