import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authApi } from "@finance/client";
import { latestReleaseId } from "@finance/release-notes/src/lazy";

import i18n from "../../../i18n";
import { ReleaseNotesRoute } from "./ReleaseNotesRoute";

const auth = vi.hoisted(() => ({
  user: { releaseNotesSeenId: null as string | null },
  refreshUser: vi.fn(),
}));

vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: auth.user, refreshUser: auth.refreshUser }),
}));
vi.mock("@finance/client", () => ({ authApi: { markReleaseNotesSeen: vi.fn() } }));

const mark = vi.mocked(authApi.markReleaseNotesSeen);

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ReleaseNotesRoute />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("ReleaseNotesRoute (spec 038)", () => {
  beforeEach(() => {
    mark.mockReset();
    auth.refreshUser.mockReset();
    auth.user = { releaseNotesSeenId: null };
  });

  it("lists the records grouped by kind and marks the newest as seen once", async () => {
    mark.mockResolvedValue(undefined);
    renderRoute();
    expect(
      await screen.findByRole("heading", { name: "Guías de finanzas personales para Chile" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Correcciones" })).toBeTruthy();
    await waitFor(() => expect(auth.refreshUser).toHaveBeenCalled());
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(latestReleaseId());
  });

  it("asks nothing when the newest was already seen", async () => {
    auth.user = { releaseNotesSeenId: latestReleaseId() };
    renderRoute();
    await screen.findByRole("heading", { name: "Guías de finanzas personales para Chile" });
    expect(mark).not.toHaveBeenCalled();
  });

  it("still reads when saving 'seen' fails", async () => {
    mark.mockRejectedValue(new Error("offline"));
    renderRoute();
    expect(
      await screen.findByRole("heading", { name: "Guías de finanzas personales para Chile" }),
    ).toBeTruthy();
    await waitFor(() => expect(mark).toHaveBeenCalled());
    expect(auth.refreshUser).not.toHaveBeenCalled();
  });
});
