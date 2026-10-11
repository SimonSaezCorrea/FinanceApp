import type { auth } from "@finance/contracts";

import { apiFetch } from "./apiClient";

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

  // Account emails (specs/032). verifyEmail/forgotPassword/resetPassword are public (the site).
  verifyEmail: (body: auth.VerifyEmailRequest) =>
    apiFetch<{ verified: true }>("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resendVerification: () =>
    apiFetch<Record<string, never>>("/auth/email/verification", { method: "POST" }),

  listEmails: () => apiFetch<auth.ListUserEmailsResponse>("/auth/me/emails"),

  requestEmailChange: (body: auth.RequestEmailChange) =>
    apiFetch<auth.UserEmailResponse>("/auth/me/emails", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  removeEmail: (id: string) => apiFetch<void>(`/auth/me/emails/${id}`, { method: "DELETE" }),

  forgotPassword: (body: auth.ForgotPasswordRequest) =>
    apiFetch<Record<string, never>>("/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resetPassword: (body: auth.ResetPasswordRequest) =>
    apiFetch<Record<string, never>>("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** The first-steps guide was finished or closed: it never shows again, on any device. */
  closeOnboarding: () => apiFetch<void>("/auth/me/onboarding/close", { method: "POST" }),
};
