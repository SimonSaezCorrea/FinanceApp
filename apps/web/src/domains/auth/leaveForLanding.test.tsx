import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRoute } from "../../app/HomeRoute";
import { NotFoundRoute } from "../../app/NotFoundRoute";
import { Providers } from "../../app/providers";
import { landingAccessUrl, landingHomeUrl } from "../../shared/lib/landingUrl";
import { RequireAuth } from "./components/RequireAuth";
import { useAuth } from "./hooks/useAuth";
import { AuthRedirectRoute } from "./routes/AuthRedirectRoute";

/** Signing in lives on the public site (spec 031): without a session every address of the app
 * leaves for its access panel, remembering where it was going; with one, the app is the app. */
const me = vi.fn();
const logout = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    me: (...args: unknown[]) => me(...args),
    logout: (...args: unknown[]) => logout(...args),
  },
}));

vi.mock("../../app/lazyPages", async () => {
  const { lazy } = await import("react");
  const stub = (text: string) =>
    lazy(async () => ({
      default: ({ children }: { children?: React.ReactNode }) => (
        <>
          {text}
          {children}
        </>
      ),
    }));
  return {
    AppLayout: lazy(async () => ({
      default: ({ children }: { children?: React.ReactNode }) => <main>{children}</main>,
    })),
    DashboardPage: stub("panel"),
  };
});

const replace = vi.fn();
const assign = vi.fn();
vi.mock("../../shared/lib/leaveApp", () => ({
  replaceLocation: (url: string) => replace(url),
  assignLocation: (url: string) => assign(url),
}));

function LogoutButton() {
  const { logout: end } = useAuth();
  return (
    <button type="button" onClick={() => void end()}>
      salir
    </button>
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <HomeRoute /> },
      { path: "/login", element: <AuthRedirectRoute mode="login" /> },
      { path: "/register", element: <AuthRedirectRoute mode="register" /> },
      {
        path: "/accounts",
        element: (
          <RequireAuth>
            <p>cuentas</p>
            <LogoutButton />
          </RequireAuth>
        ),
      },
      { path: "*", element: <NotFoundRoute /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe("the app without its landing", () => {
  beforeEach(() => {
    me.mockReset();
    logout.mockReset().mockResolvedValue(undefined);
    replace.mockReset();
    assign.mockReset();
  });

  describe("signed out", () => {
    beforeEach(() => {
      me.mockRejectedValue(new Error("401"));
    });

    it("a protected address leaves for the access panel, remembering path, query and hash", async () => {
      renderAt("/accounts?tab=billing#x");
      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(landingAccessUrl("login", "/accounts?tab=billing#x")),
      );
    });

    it("the Panel leaves for the access panel with nothing to remember", async () => {
      renderAt("/");
      await waitFor(() => expect(replace).toHaveBeenCalledWith(landingAccessUrl("login")));
    });

    it("/login and /register open their view, keeping `volver`", async () => {
      renderAt("/register?volver=%2Fdebts");
      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(landingAccessUrl("register", "/debts")),
      );
    });

    it("an unknown address asks to sign in first", async () => {
      renderAt("/nope");
      await waitFor(() => expect(replace).toHaveBeenCalledWith(landingAccessUrl("login", "/nope")));
    });
  });

  describe("signed in", () => {
    beforeEach(() => {
      me.mockResolvedValue({ id: "u1", name: "Ana" });
    });

    it("the Panel stays in the app", async () => {
      renderAt("/");
      expect(await screen.findByText("panel")).toBeDefined();
      expect(replace).not.toHaveBeenCalled();
    });

    it("an unknown address shows the app's 404", async () => {
      renderAt("/nope");
      expect(await screen.findByText("/nope")).toBeDefined();
      expect(replace).not.toHaveBeenCalled();
    });

    it("signing out ends on the public site's home", async () => {
      renderAt("/accounts");
      (await screen.findByRole("button", { name: "salir" })).click();
      await waitFor(() => expect(assign).toHaveBeenCalledWith(landingHomeUrl()));
      expect(logout).toHaveBeenCalled();
    });
  });
});
