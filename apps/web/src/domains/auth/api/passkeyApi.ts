import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const passkeyApi = {
  startRegistration: () =>
    apiFetch<auth.StartPasskeyRegistrationResponse>("/auth/me/passkeys/register-options", {
      method: "POST",
    }),

  confirmRegistration: (body: auth.ConfirmPasskeyRegistrationRequest) =>
    apiFetch<auth.Passkey>("/auth/me/passkeys/register-verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  list: () => apiFetch<auth.ListPasskeysResponse>("/auth/me/passkeys"),

  remove: (id: string) => apiFetch<void>(`/auth/me/passkeys/${id}`, { method: "DELETE" }),

  rename: (id: string, body: auth.RenamePasskeyRequest) =>
    apiFetch<auth.Passkey>(`/auth/me/passkeys/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  startLogin: (body: auth.StartPasskeyLoginRequest) =>
    apiFetch<auth.StartPasskeyLoginResponse>("/auth/login/passkey-options", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  verifyLogin: (body: auth.VerifyPasskeyLoginRequest) =>
    apiFetch<{ user: auth.CurrentUser }>("/auth/login/passkey-verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
