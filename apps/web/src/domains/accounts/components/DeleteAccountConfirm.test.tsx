import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { accountsApi } from "../api/accountsApi";
import { DeleteAccountConfirm } from "./DeleteAccountConfirm";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { deletionImpact: vi.fn(), list: vi.fn(), remove: vi.fn() },
}));

const account = { id: "a1", name: "Destino" } as unknown as accounts.BankAccount;

function impact(
  over: Partial<accounts.AccountDeletionImpact> = {},
): accounts.AccountDeletionImpact {
  return {
    movements: {
      count: 3,
      transfers: 1,
      paymentsFromOtherAccounts: 0,
      restorations: [{ accountId: "b", amount: "-50000.0000", currency: "CLP" }],
    },
    installmentPlans: { count: 0, restorations: [] },
    recurring: { count: 2 },
    savingsEntries: { count: 0 },
    linkedDebts: { count: 1 },
    ...over,
  };
}

function renderConfirm(onDeleted = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <DeleteAccountConfirm
          account={account}
          onOpenChange={vi.fn()}
          onDeleted={onDeleted}
          onError={vi.fn()}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onDeleted };
}

describe("DeleteAccountConfirm", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(accountsApi.list).mockResolvedValue([
      { id: "b", name: "Origen" } as unknown as accounts.BankAccount,
    ]);
    vi.mocked(accountsApi.remove).mockResolvedValue(undefined);
  });

  it("lists only the groups that hold something, with what they give back", async () => {
    vi.mocked(accountsApi.deletionImpact).mockResolvedValue(impact());
    renderConfirm();
    expect(await screen.findByText("3 movimientos")).toBeTruthy();
    expect(screen.getByText("2 recurrentes")).toBeTruthy();
    expect(screen.queryByText(/planes? de cuotas/)).toBeNull();
    expect(await screen.findByText(/Devuelve a Origen/)).toBeTruthy();
    expect(screen.getByText(/1 deuda asociada/)).toBeTruthy();
  });

  it("sends movements by default and whatever else was switched on", async () => {
    vi.mocked(accountsApi.deletionImpact).mockResolvedValue(impact());
    const { onDeleted } = renderConfirm();
    fireEvent.click(await screen.findByRole("switch", { name: "2 recurrentes" }));
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    await waitFor(() =>
      expect(accountsApi.remove).toHaveBeenCalledWith("a1", {
        movements: true,
        installmentPlans: false,
        recurring: true,
        savingsEntries: false,
      }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("says so when nothing is tied to the account", async () => {
    vi.mocked(accountsApi.deletionImpact).mockResolvedValue(
      impact({
        movements: { count: 0, transfers: 0, paymentsFromOtherAccounts: 0, restorations: [] },
        recurring: { count: 0 },
        linkedDebts: { count: 0 },
      }),
    );
    renderConfirm();
    expect(
      await screen.findByText("No hay movimientos ni datos relacionados con esta cuenta."),
    ).toBeTruthy();
  });
});
