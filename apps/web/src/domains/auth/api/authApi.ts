import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const authApi = {
  register: (body: auth.RegisterRequest) =>
    apiFetch<auth.CurrentUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: auth.LoginRequest) =>
    apiFetch<auth.LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  verifyMfaLogin: (body: auth.VerifyMfaLoginRequest) =>
    apiFetch<{ user: auth.CurrentUser }>("/auth/login/mfa-verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => apiFetch<auth.CurrentUser>("/auth/me"),

  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),

  startMfaEnrollment: () =>
    apiFetch<auth.StartMfaEnrollmentResponse>("/auth/me/mfa/enroll", { method: "POST" }),

  confirmMfaEnrollment: (body: auth.ConfirmMfaEnrollmentRequest) =>
    apiFetch<auth.ConfirmMfaEnrollmentResponse>("/auth/me/mfa/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  disableMfa: (body: auth.DisableMfaRequest) =>
    apiFetch<void>("/auth/me/mfa/disable", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
