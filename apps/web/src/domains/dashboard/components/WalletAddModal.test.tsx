import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts, wallet } from "@finance/contracts";

import i18n from "../../../i18n";
import { accountsApi } from "../../accounts/api/accountsApi";
import { walletApi } from "../api/walletApi";
import { WalletAddModal } from "./WalletAddModal";

vi.mock("../../accounts/api/accountsApi", () => ({ accountsApi: { list: vi.fn() } }));
vi.mock("../api/walletApi", () => ({ walletApi: { replace: vi.fn(), list: vi.fn() } }));
vi.mock("../../profile/components/MaskedAmount", () => ({
  MaskedAmount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// The Panel's own tile is exercised elsewhere; here it only has to show up.
vi.mock("../../accounts/components/AccountVisualCard", () => ({
  AccountVisualCard: ({
    account,
    card,
  }: {
    account: accounts.BankAccount;
    card?: accounts.Card;
  }) => <div data-testid="tile">{card ? `card ${card.last4}` : `account ${account.name}`}</div>,
}));

const card = (id: string, last4: string, kind: accounts.Card["kind"], isAdditional = false) =>
  ({ id, last4, kind, isAdditional, isPrimary: !isAdditional }) as accounts.Card;

const account = (
  id: string,
  name: string,
  type: accounts.AccountType,
  cards: accounts.Card[] = [],
): accounts.BankAccount =>
  ({
    id,
    name,
    type,
    currency: "CLP",
    currentBalance: "1000",
    creditUsed: "0",
    cards,
  }) as unknown as accounts.BankAccount;

const LIST = [
  account("01a0e4e0-7003-7306-93f7-e70eb0a8ea75", "BCI Crédito", "CREDIT_CARD", [
    card("01a0e4e0-7014-7337-ba11-0e35122e6a77", "7758", "CREDIT"),
    card("01a0e4e0-7008-76ba-996e-72069c2c40b4", "7774", "CREDIT", true),
  ]),
  account("01a0e4de-7077-756a-9d9f-3b6fec472679", "BCI - Platinum", "CHECKING", [
    card("01a0e4de-70df-772c-839d-b1545aada3f6", "2705", "DEBIT"),
  ]),
  account("01a0e4e3-a5c6-7730-96f5-2d6714e7de98", "MACH 24/7", "SAVINGS"),
  account("01a0db68-83c1-730c-a314-3cc345945e79", "Efectivo", "CASH"),
];

function renderModal(pinned: wallet.WalletItem[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <WalletAddModal open onOpenChange={onOpenChange} pinned={pinned} />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const row = (name: RegExp) => screen.getByRole("button", { name });

describe("WalletAddModal (Arma tu cartera)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(accountsApi.list).mockResolvedValue(LIST);
    vi.mocked(walletApi.replace).mockResolvedValue([]);
  });

  it("lists each account with its cards, labelled Cuenta or Tarjeta", async () => {
    renderModal();
    expect(await screen.findByRole("button", { name: /BCI Crédito.*Cuenta/ })).toBeTruthy();
    expect(row(/7758.*Principal.*Tarjeta/)).toBeTruthy();
    expect(row(/7774.*Adicional.*Tarjeta/)).toBeTruthy();
  });

  it("saves the picks in the order they were made", async () => {
    const { onOpenChange } = renderModal();
    fireEvent.click(await screen.findByRole("button", { name: /7758/ }));
    fireEvent.click(row(/MACH 24\/7/));
    expect(row(/7758/).textContent).toContain("1 · En el Panel");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(walletApi.replace).toHaveBeenCalled());
    expect(vi.mocked(walletApi.replace).mock.calls[0]![0]).toEqual({
      items: [
        { cardId: "01a0e4e0-7014-7337-ba11-0e35122e6a77" },
        { accountId: "01a0e4e3-a5c6-7730-96f5-2d6714e7de98" },
      ],
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("locks the rest once 4 are picked", async () => {
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: /7758/ }));
    fireEvent.click(row(/7774/));
    fireEvent.click(row(/MACH 24\/7/));
    fireEvent.click(row(/Efectivo/));
    expect((row(/2705/) as HTMLButtonElement).disabled).toBe(true);
    expect(row(/2705/).textContent).toContain("Cartera llena");
  });

  it("points out a debit card that repeats its account's balance", async () => {
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: /BCI - Platinum.*Cuenta/ }));
    fireEvent.click(row(/2705/));
    expect(screen.getByText(/muestra el mismo saldo que BCI - Platinum/)).toBeTruthy();
  });
});
