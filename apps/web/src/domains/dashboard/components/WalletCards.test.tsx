import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts, wallet } from "@finance/contracts";

import i18n from "../../../i18n";
import { accountsApi } from "../../accounts/api/accountsApi";
import { walletApi } from "../api/walletApi";
import { WalletCards } from "./WalletCards";

vi.mock("../../accounts/api/accountsApi", () => ({ accountsApi: { list: vi.fn() } }));
vi.mock("../api/walletApi", () => ({
  walletApi: { list: vi.fn(), replace: vi.fn(), reorder: vi.fn(), remove: vi.fn() },
}));
vi.mock("../../profile/components/MaskedAmount", () => ({
  MaskedAmount: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../accounts/components/AccountVisualCard", () => ({
  AccountVisualCard: ({ account }: { account: accounts.BankAccount }) => (
    <div data-testid="tile">{account.name}</div>
  ),
}));

const MACH = {
  id: "01a0e4e3-a5c6-7730-96f5-2d6714e7de98",
  name: "MACH 24/7",
  type: "SAVINGS",
  currency: "CLP",
  currentBalance: "1000",
  creditUsed: "0",
  cards: [],
} as unknown as accounts.BankAccount;

/** The wallet the server holds once MACH 24/7 is saved into it. */
const SAVED: wallet.WalletItem[] = [
  {
    id: "01a0e522-957f-7729-a869-e59fb048ef91",
    accountId: MACH.id,
    cardId: null,
    order: 0,
    createdAt: "2026-09-27T00:00:00.000Z",
  },
];

describe("WalletCards", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(accountsApi.list).mockResolvedValue([MACH]);
    vi.mocked(walletApi.list).mockResolvedValue([]);
    vi.mocked(walletApi.replace).mockResolvedValue(SAVED);
  });

  it("shows what was saved as soon as the editor saves, without a reload", async () => {
    // Empty at first; after the save, the server answers with what was saved.
    vi.mocked(walletApi.list).mockResolvedValueOnce([]).mockResolvedValue(SAVED);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <WalletCards accountList={[MACH]} />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /añadir/i }));
    fireEvent.click(await screen.findByRole("button", { name: /MACH 24\/7.*Cuenta/ }));
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(screen.getAllByTestId("tile").length).toBeGreaterThan(0));
    // The Panel grid (not only the editor's preview) holds the saved tile.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("tile").textContent).toBe("MACH 24/7");
  });

  it("recovers from a wallet that had failed to load: saving shows the new one", async () => {
    vi.mocked(walletApi.list).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(SAVED);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <WalletCards accountList={[MACH]} />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
    // A failed load says so and offers a retry — it does not pose as empty.
    fireEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(screen.getByTestId("tile").textContent).toBe("MACH 24/7"));
  });

  it("shows exactly 4 when full, with editing moved to the header", async () => {
    const four = ["a", "b", "c", "d", "e"].map((n, i) => ({
      ...MACH,
      id: `01a0e4e3-a5c6-7730-96f5-2d6714e7de9${i}`,
      name: `Cuenta ${n}`,
    }));
    vi.mocked(walletApi.list).mockResolvedValue(
      four.map((a, order) => ({
        id: `01a0e522-957f-7729-a869-e59fb048ef9${order}`,
        accountId: a.id,
        cardId: null,
        order,
        createdAt: "2026-09-27T00:00:00.000Z",
      })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <WalletCards accountList={four as accounts.BankAccount[]} />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("tile")).toHaveLength(4));
    expect(screen.queryByRole("button", { name: /^añadir$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /editar cartera/i })).toBeTruthy();
  });
});
