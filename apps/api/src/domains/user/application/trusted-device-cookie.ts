import { createHash, randomBytes } from "node:crypto";

import { auth } from "@finance/contracts";

/** The httpOnly cookie that carries a remembered device's token (specs/040). */
export const TRUSTED_DEVICE_COOKIE = "mfa_trusted";
/** Only the auth routes read it: login (to skip the second factor) and the device list. */
export const TRUSTED_DEVICE_COOKIE_PATH = "/api/v1/auth";
export const TRUSTED_DEVICE_COOKIE_MAX_AGE_MS = auth.TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000;

/** A fresh token: 32 random bytes, base64url. Leaves the server only inside the cookie. */
export function generateTrustedDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the table stores. 256 bits of entropy need no server key: the hash can't be reversed. */
export function hashTrustedDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
