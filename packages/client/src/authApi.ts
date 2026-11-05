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

  /** Second-factor resend while signing in (specs/040, email method). */
  resendMfaLoginCode: () =>
    apiFetch<auth.MfaCodeSentResponse>("/auth/login/mfa-resend", { method: "POST" }),

  /** Without MFA: activates the method. With MFA: changes it (needs a recent step-up). */
  startMfaEnrollment: (body: auth.StartMfaEnrollmentRequest = {}) =>
    apiFetch<auth.StartMfaEnrollmentResponse>("/auth/me/mfa/enroll", {
      method: "POST",
      body: JSON.stringify(body),
    }),

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

  /** 10 new recovery codes (specs/040); needs, and spends, a recent step-up. */
  regenerateRecoveryCodes: () =>
    apiFetch<auth.RegenerateRecoveryCodesResponse>("/auth/me/mfa/recovery-codes", {
      method: "POST",
    }),

  listTrustedDevices: () =>
    apiFetch<auth.ListTrustedDevicesResponse>("/auth/me/mfa/trusted-devices"),

  removeTrustedDevice: (id: string) =>
    apiFetch<void>(`/auth/me/mfa/trusted-devices/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** Sends a step-up code to the confirmed email (specs/040, email method). */
  sendStepUpEmailCode: () =>
    apiFetch<auth.MfaCodeSentResponse>("/auth/sessions/step-up/email-code", { method: "POST" }),

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
  /** Novedades (spec 038): the newest version the person saw (`1.2`). */
  markReleaseNotesSeen: (version: string) =>
    apiFetch<void>("/auth/me/release-notes/seen", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
};
