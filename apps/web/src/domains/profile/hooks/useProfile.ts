import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { auth } from "@finance/contracts";

import { accountsApi } from "../../accounts/api/accountsApi";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { passkeyApi } from "../../auth/api/passkeyApi";
import { transactionsApi } from "../../transactions/api/transactionsApi";
import { consentsApi } from "../api/consentsApi";
import { profileApi } from "../api/profileApi";
import { sessionsApi } from "../api/sessionsApi";

/** Own list — unlike MFA's recovery-code count, `CurrentUser` carries nothing about passkeys
 * (specs/022 research R8), so this is a genuine query of its own. */
export function usePasskeysQuery() {
  return useQuery({ queryKey: ["passkeys"], queryFn: () => passkeyApi.list() });
}

/** Real sessions/devices (specs/023) — replaces the old `EXAMPLE_SESSIONS` placeholder. */
export function useSessionsQuery() {
  return useQuery({ queryKey: ["sessions"], queryFn: () => sessionsApi.list() });
}

/** Every consent the user has granted (Ley 21.719 Art. 16) — today just the one recorded at
 * registration; a "mis consentimientos" list, not an editable preference. */
export function useConsentsQuery() {
  return useQuery({ queryKey: ["consents"], queryFn: () => consentsApi.list() });
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
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    }),
    updatePreferences: useMutation({
      mutationFn: (body: auth.UpdatePreferencesRequest) => profileApi.updatePreferences(body),
      onSuccess: () => refreshUser(),
    }),
    deleteAccount: useMutation({
      mutationFn: (body: auth.DeleteAccountRequest) => profileApi.deleteAccount(body),
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
      onSuccess: () => {
        refreshUser();
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      },
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
    renamePasskey: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => passkeyApi.rename(id, { name }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys"] }),
    }),
    closeSession: useMutation({
      mutationFn: (id: string) => sessionsApi.close(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    }),
    revokeOtherSessions: useMutation({
      mutationFn: () => sessionsApi.revokeOthers(),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    }),
    // Step-up before closing another session or "cerrar todas" (2026-09-25) — success just
    // returns `verifiedUntil`; nothing to invalidate, the caller keeps that timestamp itself.
    stepUp: useMutation({
      mutationFn: (body: auth.StepUpRequest) => sessionsApi.stepUp(body),
    }),
    stepUpPasskeyOptions: useMutation({
      mutationFn: () => sessionsApi.stepUpPasskeyOptions(),
    }),
    stepUpPasskeyVerify: useMutation({
      mutationFn: (response: unknown) => sessionsApi.stepUpPasskeyVerify(response),
    }),
  };
}
