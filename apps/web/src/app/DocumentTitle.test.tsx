import { render, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
import { DocumentTitle } from "./DocumentTitle";
import { Providers } from "./providers";
import { tabTitle } from "./tabTitle";

vi.mock("../domains/auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockRejectedValue(new Error("not signed in")),
    logout: vi.fn(),
  },
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <DocumentTitle />,
        children: [
          { path: "/", element: <p>home</p>, handle: { signedInTitle: "nav.dashboard" } },
          { path: "/precios", element: <p>pricing</p>, handle: { title: "landing.nav.pricing" } },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe("tab title", () => {
  it("joins the brand and the section, or shows the brand alone", () => {
    expect(tabTitle("Cuadra", "Precios")).toBe("Cuadra · Precios");
    expect(tabTitle("Cuadra", null)).toBe("Cuadra");
  });

  it("names the section of the current route", async () => {
    renderAt("/precios");
    await waitFor(() =>
      expect(document.title).toBe(`${i18n.t("brand.name")} · ${i18n.t("landing.nav.pricing")}`),
    );
  });

  it("shows only the brand on the landing home for a visitor", async () => {
    renderAt("/");
    await waitFor(() => expect(document.title).toBe(i18n.t("brand.name")));
  });
});
