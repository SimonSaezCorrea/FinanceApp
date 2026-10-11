export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

export type EmailLocale = "es" | "en";
export type EmailKind = "verify-email" | "reset-password" | "security-notice";

/** A fully rendered email, ready to hand to a sender (specs/032). */
export interface OutgoingEmail {
  /** Unique per email — the `Idempotency-Key` towards the provider, so a network retry can't
   * deliver it twice. */
  id: string;
  kind: EmailKind;
  to: string;
  locale: EmailLocale;
  subject: string;
  html: string;
  text: string;
}

/**
 * Where an email goes (Adapter). Chosen once at boot by `email.config.ts` (research.md R3):
 * Resend in production with a key, disabled anywhere else (tests swap in an in-memory one). `send()` may throw; every caller wraps it so a
 * failed email never fails the action that triggered it (FR-006).
 */
export interface EmailSenderPort {
  /** False only for the disabled sender: screens that depend on an email say so (FR-005). */
  readonly available: boolean;
  send(email: OutgoingEmail): Promise<void>;
}
