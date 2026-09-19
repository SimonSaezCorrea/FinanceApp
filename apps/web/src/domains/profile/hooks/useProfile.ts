import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { auth } from "@finance/contracts";

import { accountsApi } from "../../accounts/api/accountsApi";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { passkeyApi } from "../../auth/api/passkeyApi";
import { transactionsApi } from "../../transactions/api/transactionsApi";
import { profileApi } from "../api/profileApi";

/** Own list — unlike MFA's recovery-code count, `CurrentUser` carries nothing about passkeys
 * (specs/022 research R8), so this is a genuine query of its own. */
export function usePasskeysQuery() {
  return useQuery({ queryKey: ["passkeys"], queryFn: () => passkeyApi.list() });
}

function startOfMonthISO(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function endOfMonthISO(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
}

/** Frontend-only aggregation over existing domains — same pattern as the Panel (dashboard). */
export function useProfileStats() {
  const now = new Date();
  const accountsQuery = useQuery({
    queryKey: ["accounts", { status: "active" }],
    queryFn: () => accountsApi.list({ status: "active" }),
  });
  // Only the count is needed, so ask the API for the count — fetching every
  // movement of the month just to read `.length` off it is pure waste.
  const transactionsQuery = useQuery({
    queryKey: ["transactions", "summary", { from: startOfMonthISO(now), to: endOfMonthISO(now) }],
    queryFn: () => transactionsApi.summary({ from: startOfMonthISO(now), to: endOfMonthISO(now) }),
  });

  return {
    isLoading: accountsQuery.isLoading || transactionsQuery.isLoading,
    accountsCount: accountsQuery.data?.length ?? 0,
    monthlyMovementsCount: transactionsQuery.data?.total ?? 0,
  };
}

export function useProfileMutations() {
  const { refreshUser, clearUser } = useAuth();
  const queryClient = useQueryClient();

  return {
    updateProfile: useMutation({
      mutationFn: (body: auth.UpdateProfileRequest) => profileApi.updateProfile(body),
      onSuccess: () => refreshUser(),
    }),
    changePassword: useMutation({
      mutationFn: (body: auth.ChangePasswordRequest) => profileApi.changePassword(body),
    }),
    updatePreferences: useMutation({
      mutationFn: (body: auth.UpdatePreferencesRequest) => profileApi.updatePreferences(body),
      onSuccess: () => refreshUser(),
    }),
    deactivate: useMutation({
      mutationFn: (body: auth.DeactivateRequest) => profileApi.deactivate(body),
      onSuccess: () => clearUser(),
    }),
    startMfaEnrollment: useMutation({
      mutationFn: () => authApi.startMfaEnrollment(),
    }),
    confirmMfaEnrollment: useMutation({
      mutationFn: (body: auth.ConfirmMfaEnrollmentRequest) => authApi.confirmMfaEnrollment(body),
      onSuccess: () => refreshUser(),
    }),
    disableMfa: useMutation({
      mutationFn: (body: auth.DisableMfaRequest) => authApi.disableMfa(body),
      onSuccess: () => refreshUser(),
    }),
    startPasskeyRegistration: useMutation({
      mutationFn: () => passkeyApi.startRegistration(),
    }),
    confirmPasskeyRegistration: useMutation({
      mutationFn: (body: auth.ConfirmPasskeyRegistrationRequest) =>
        passkeyApi.confirmRegistration(body),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys"] }),
    }),
    removePasskey: useMutation({
      mutationFn: (id: string) => passkeyApi.remove(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys"] }),
    }),
  };
}
