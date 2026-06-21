import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { wallet } from "@finance/contracts";

import { walletApi } from "../api/walletApi";

const KEY = ["wallet"] as const;

export function useWallet() {
  return useQuery({
    queryKey: KEY,
    queryFn: walletApi.list,
  });
}

/**
 * Wallet mutations. Each writes the server response straight into the cache so
 * the panel updates live (no dependency on a follow-up refetch).
 */
export function useWalletMutations() {
  const qc = useQueryClient();

  return {
    add: useMutation({
      mutationFn: walletApi.add,
      onSuccess: (created) =>
        qc.setQueryData<wallet.WalletItem[]>(KEY, (old) => [...(old ?? []), created]),
    }),
    reorder: useMutation({
      mutationFn: walletApi.reorder,
      onSuccess: (list) => qc.setQueryData<wallet.WalletItem[]>(KEY, list),
    }),
    remove: useMutation({
      mutationFn: walletApi.remove,
      onSuccess: (_data, id) =>
        qc.setQueryData<wallet.WalletItem[]>(KEY, (old) =>
          (old ?? []).filter((item) => item.id !== id),
        ),
    }),
  };
}
