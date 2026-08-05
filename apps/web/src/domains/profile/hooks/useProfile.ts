import { useMutation, useQuery } from "@tanstack/react-query";

import type { auth } from "@finance/contracts";

import { accountsApi } from "../../accounts/api/accountsApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { transactionsApi } from "../../transactions/api/transactionsApi";
import { profileApi } from "../api/profileApi";

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
  };
}
