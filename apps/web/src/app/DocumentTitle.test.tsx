import { render, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
import { DocumentTitle } from "./DocumentTitle";
import { Providers } from "./providers";
import { tabTitle } from "./tabTitle";

vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
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
          { path: "/accounts", element: <p>accounts</p>, handle: { title: "accounts.title" } },
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
    renderAt("/accounts");
    await waitFor(() =>
      expect(document.title).toBe(`${i18n.t("brand.name")} · ${i18n.t("accounts.title")}`),
    );
  });

  it("shows only the brand before the session is known", async () => {
    renderAt("/");
    await waitFor(() => expect(document.title).toBe(i18n.t("brand.name")));
  });
});
