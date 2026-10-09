import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import { AuthProvider, useAuth } from "./hooks/useAuth";

/** The account's language decides the app's (spec 031 FR-010a): someone who signed up from the
 * English public site opens the app in English, without a Spanish flash first. */
const me = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p>{user ? `${user.name} · ${i18n.language}` : "signed out"}</p>;
}

describe("session language", () => {
  afterEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("switches to the account's language before showing the user", async () => {
    me.mockResolvedValue({ id: "u1", name: "Ana", locale: "en" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Ana · en")).toBeDefined();
  });

  it("stays in Spanish for a Spanish account or no session", async () => {
    me.mockResolvedValue({ id: "u1", name: "Ana", locale: "es" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Ana · es")).toBeDefined();
    await waitFor(() => expect(i18n.language).toBe("es"));
  });
});
