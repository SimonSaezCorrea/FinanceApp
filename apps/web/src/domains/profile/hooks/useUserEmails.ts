import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { auth } from "@finance/contracts";

import { authApi } from "@finance/client";
import { useAuth } from "../../auth/hooks/useAuth";

const EMAILS_KEY = ["user-emails"] as const;

/** The account's email registry (specs/032): the primary, a pending change and past addresses. */
export function useUserEmails() {
  return useQuery({ queryKey: EMAILS_KEY, queryFn: () => authApi.listEmails() });
}

/** The pending address, if a change is waiting for its link. */
export function pendingEmail(items: auth.UserEmail[] | undefined): auth.UserEmail | null {
  return items?.find((e) => e.status === "PENDING") ?? null;
}

export function useUserEmailMutations() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: EMAILS_KEY });

  return {
    requestChange: useMutation({
      mutationFn: (address: string) => authApi.requestEmailChange({ address }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => authApi.removeEmail(id),
      onSuccess: invalidate,
    }),
    resend: useMutation({
      mutationFn: () => authApi.resendVerification(),
      // A confirmed address may have been confirmed in another tab meanwhile.
      onError: () => void refreshUser(),
    }),
  };
}
