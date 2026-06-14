import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { accountsApi } from "../api/accountsApi";
import { AccountsRoute } from "./AccountsRoute";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { list: vi.fn() },
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AccountsRoute />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("AccountsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders accounts returned by the API", async () => {
    vi.mocked(accountsApi.list).mockResolvedValue([
      {
        id: "a1",
        name: "Checking",
        currency: "USD",
        institution: null,
        currentBalance: "1240.5000",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Checking/)).toBeDefined());
  });

  it("shows the empty state when there are no accounts", async () => {
    vi.mocked(accountsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("accounts.empty"))).toBeDefined());
  });
});
