import type { wallet } from "@finance/contracts";

import { apiFetch } from "@finance/client";

export const walletApi = {
  list: () => apiFetch<wallet.WalletItem[]>("/wallet"),

  add: (body: wallet.CreateWalletItem) =>
    apiFetch<wallet.WalletItem>("/wallet", { method: "POST", body: JSON.stringify(body) }),

  reorder: (ids: string[]) =>
    apiFetch<wallet.WalletItem[]>("/wallet/reorder", {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    }),

  /** The whole wallet at once, in display order. */
  replace: (body: wallet.ReplaceWallet) =>
    apiFetch<wallet.WalletItem[]>("/wallet", { method: "PUT", body: JSON.stringify(body) }),

  remove: (id: string) => apiFetch<void>(`/wallet/${id}`, { method: "DELETE" }),
};
