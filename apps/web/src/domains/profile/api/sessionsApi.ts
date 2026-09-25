import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const sessionsApi = {
  list: () => apiFetch<auth.ListSessionsResponse>("/auth/sessions"),

  close: (id: string) => apiFetch<void>(`/auth/sessions/${id}`, { method: "DELETE" }),

  revokeOthers: () =>
    apiFetch<void>("/auth/sessions/revoke-others", {
      method: "POST",
    }),

  // Step-up before closing another session or "cerrar todas las demás" (2026-09-25).
  stepUp: (body: auth.StepUpRequest) =>
    apiFetch<auth.StepUpResponse>("/auth/sessions/step-up", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  stepUpPasskeyOptions: () =>
    apiFetch<auth.StartPasskeyLoginResponse>("/auth/sessions/step-up/passkey-options", {
      method: "POST",
    }),

  stepUpPasskeyVerify: (response: unknown) =>
    apiFetch<auth.StepUpResponse>("/auth/sessions/step-up/passkey-verify", {
      method: "POST",
      body: JSON.stringify({ response }),
    }),
};
