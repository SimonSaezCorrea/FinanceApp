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
      onMutate: async (ids) => {
        await qc.cancelQueries({ queryKey: KEY });
        const previous = qc.getQueryData<wallet.WalletItem[]>(KEY);
        qc.setQueryData<wallet.WalletItem[]>(KEY, (old) => {
          const byId = new Map((old ?? []).map((item) => [item.id, item]));
          return ids.map((id) => byId.get(id)).filter((item): item is wallet.WalletItem => !!item);
        });
        return { previous };
      },
      onError: (_err, _ids, context) => {
        if (context?.previous) qc.setQueryData<wallet.WalletItem[]>(KEY, context.previous);
      },
      onSuccess: (list) => qc.setQueryData<wallet.WalletItem[]>(KEY, list),
    }),
    replace: useMutation({
      mutationFn: walletApi.replace,
      // Show what was saved right away, then confirm it with the server: the
      // write also clears a wallet query that had failed to load (it is not left
      // showing an empty wallet next to the one just saved).
      onSuccess: (list) => {
        qc.setQueryData<wallet.WalletItem[]>(KEY, list);
        void qc.invalidateQueries({ queryKey: KEY });
      },
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
