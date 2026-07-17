import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const profileApi = {
  updateProfile: (body: auth.UpdateProfileRequest) =>
    apiFetch<auth.CurrentUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  changePassword: (body: auth.ChangePasswordRequest) =>
    apiFetch<void>("/auth/me/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updatePreferences: (body: auth.UpdatePreferencesRequest) =>
    apiFetch<auth.CurrentUser>("/auth/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deactivate: (body: auth.DeactivateRequest) =>
    apiFetch<void>("/auth/me/deactivate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
