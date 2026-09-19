import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const sessionsApi = {
  list: () => apiFetch<auth.ListSessionsResponse>("/auth/sessions"),

  close: (id: string) => apiFetch<void>(`/auth/sessions/${id}`, { method: "DELETE" }),

  revokeOthers: () =>
    apiFetch<void>("/auth/sessions/revoke-others", {
      method: "POST",
    }),
};
