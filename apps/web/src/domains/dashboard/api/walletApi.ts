import type { wallet } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const walletApi = {
  list: () => apiFetch<wallet.WalletItem[]>("/wallet"),

  add: (body: wallet.CreateWalletItem) =>
    apiFetch<wallet.WalletItem>("/wallet", { method: "POST", body: JSON.stringify(body) }),

  reorder: (ids: string[]) =>
    apiFetch<wallet.WalletItem[]>("/wallet/reorder", {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    }),

  remove: (id: string) => apiFetch<void>(`/wallet/${id}`, { method: "DELETE" }),
};
