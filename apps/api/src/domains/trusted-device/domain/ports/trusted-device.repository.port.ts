import type { TrustedDevicePlan, TrustedDeviceProps } from "../trusted-device.entity";

export const TRUSTED_DEVICE_REPOSITORY = Symbol("TRUSTED_DEVICE_REPOSITORY");

/** Port for the `trusted-device` table only (Adapter, Constitution VI). */
export interface TrustedDeviceRepositoryPort {
  /** Inserts a remembered device inside the caller's transaction, then deletes the account's
   * oldest ones beyond `TRUSTED_DEVICE_MAX`. */
  rememberWithTx(tx: unknown, plan: TrustedDevicePlan): Promise<void>;
  /** The row whose token hashes to `tokenHash`, if it hasn't expired — whoever owns it (the
   * caller checks it belongs to the account signing in). */
  findValidByTokenHash(tokenHash: string, now: Date): Promise<TrustedDeviceProps | null>;
  /** Stamps the last time it skipped the second factor (informational). */
  touch(id: string, now: Date): Promise<void>;
  /** The account's unexpired devices, newest first. */
  listForUser(userId: string, now: Date): Promise<TrustedDeviceProps[]>;
  /** Forgets one of the account's devices; false when it isn't theirs or doesn't exist. */
  deleteOwned(userId: string, id: string): Promise<boolean>;
  /** Forgets every device of the account (password change/reset, MFA off or changed, new codes). */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
  /** Maintenance: deletes rows that expired before `now`. */
  purgeExpired(now: Date): Promise<number>;
}
