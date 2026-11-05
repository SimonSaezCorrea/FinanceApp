import { auth } from "@finance/contracts";

/**
 * `trusted-device` table (specs/040): a browser where the person asked not to be asked for the
 * second factor again. Not an aggregate root: it only exists under a `User` and is written by the
 * `user` domain's MFA commands. The browser holds the token; this row keeps only its SHA-256.
 */
export interface TrustedDeviceProps {
  id: string;
  userId: string;
  tokenHash: string;
  deviceLabel: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
}

/** What `rememberWithTx` inserts. */
export interface TrustedDevicePlan {
  id: string;
  userId: string;
  tokenHash: string;
  deviceLabel: string;
  createdAt: Date;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a device remembered at `createdAt` stops skipping the second factor: a FIXED 30 days,
 * never extended by use (a stolen, regularly used device must not stay remembered forever). */
export function trustedDeviceExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + auth.TRUSTED_DEVICE_DAYS * DAY_MS);
}

/** Whether this row lets `userId` skip the second factor right now. */
export function trustedDeviceIsValidFor(
  device: Pick<TrustedDeviceProps, "userId" | "expiresAt">,
  userId: string,
  now: Date,
): boolean {
  return device.userId === userId && device.expiresAt.getTime() > now.getTime();
}
