import { randomInt } from "node:crypto";

import { auth } from "@finance/contracts";

/**
 * `mfa-code` table (specs/040): a 6-digit second-factor code sent through a channel (today only
 * email). Never stored in clear: `codeHash` is an HMAC with a server key (`mfa-code-hash.ts` in
 * `user`). One ACTIVE code per account and purpose (partial unique index): a newer one replaces it.
 */
export type MfaCodePurpose = "LOGIN" | "ENROLL" | "STEP_UP";
export type MfaCodeChannel = "EMAIL";

export interface MfaCodeProps {
  id: string;
  userId: string;
  purpose: MfaCodePurpose;
  channel: MfaCodeChannel;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** What `issue` inserts. The id is minted by the caller: it is part of the HMAC's message. */
export interface MfaCodePlan {
  id: string;
  userId: string;
  purpose: MfaCodePurpose;
  channel: MfaCodeChannel;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** A uniformly random 6-digit code, leading zeros kept. */
export function generateMfaCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function mfaCodeExpiry(now: Date): Date {
  return new Date(now.getTime() + auth.MFA_CODE_TTL_MINUTES * MINUTE_MS);
}

export function oneHourBefore(now: Date): Date {
  return new Date(now.getTime() - HOUR_MS);
}

/**
 * Seconds until another code of this purpose may be sent, or 0 when it may go now: one per
 * `MFA_CODE_RESEND_SECONDS`, at most `MFA_CODE_MAX_PER_HOUR` per hour (the oldest of that hour has
 * to age out first).
 */
export function resendWaitSeconds(input: { now: Date; issuedLastHour: Date[] }): number {
  const now = input.now.getTime();
  const sorted = input.issuedLastHour.map((d) => d.getTime()).sort((a, b) => a - b);
  let waitMs = 0;
  const last = sorted[sorted.length - 1];
  if (last !== undefined) {
    waitMs = Math.max(waitMs, last + auth.MFA_CODE_RESEND_SECONDS * 1000 - now);
  }
  if (sorted.length >= auth.MFA_CODE_MAX_PER_HOUR) {
    const freeing = sorted[sorted.length - auth.MFA_CODE_MAX_PER_HOUR]!;
    waitMs = Math.max(waitMs, freeing + HOUR_MS - now);
  }
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}
