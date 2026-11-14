import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * "This browser has signed in to this account before" (security run-3, the OWASP device-cookie
 * pattern). Whoever knows a RUT could send 5 wrong passwords every 15 minutes and keep the owner
 * locked out for good, since the lockout is per account. A browser that completed a sign-in gets
 * this cookie; on later logins the account-wide lock doesn't apply to it — only its OWN failures
 * count, in `loginDeviceFailures` — so a third party's guesses never lock the owner out of the
 * browsers they already use. A browser without it is treated exactly as before.
 *
 * Stateless: `base64url(payload).base64url(HMAC)`, payload `{u: userId, n: nonce, e: expiry,
 * c: credential tag}`, with a key derived from `JWT_REFRESH_SECRET` (HKDF, its own `info`, so it
 * can't be confused with any other token). Nothing to store or sweep; rotating that secret forgets
 * every device.
 *
 * The credential tag is an HMAC of the account's current password hash: changing or recovering the
 * password voids every device token issued before, so someone who once signed in (with a stolen
 * password, say) keeps no way around the lockout once the owner reacts — the same moment that
 * closes their sessions.
 */
export const LOGIN_DEVICE_COOKIE = "login_device";
/** Only the login route reads it. */
export const LOGIN_DEVICE_COOKIE_PATH = "/api/v1/auth";
export const LOGIN_DEVICE_DAYS = 180;
export const LOGIN_DEVICE_COOKIE_MAX_AGE_MS = LOGIN_DEVICE_DAYS * 24 * 60 * 60 * 1000;

interface Payload {
  u: string;
  n: string;
  e: number;
  c: string;
}

@Injectable()
export class LoginDeviceToken {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      hkdfSync(
        "sha256",
        config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        Buffer.alloc(0),
        "fik/login-device",
        32,
      ),
    );
  }

  /** A fresh token for `userId` and its current password hash, valid `LOGIN_DEVICE_DAYS`. */
  issue(userId: string, passwordHash: string | null, now = Date.now()): string {
    const payload: Payload = {
      u: userId,
      n: randomBytes(16).toString("base64url"),
      e: now + LOGIN_DEVICE_COOKIE_MAX_AGE_MS,
      c: this.credentialTag(passwordHash),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.mac(body)}`;
  }

  /** The device's id (its nonce) when `token` is a valid, unexpired one of `userId` issued under
   * its current password; else null. */
  deviceFor(
    token: string | undefined,
    userId: string,
    passwordHash: string | null,
    now = Date.now(),
  ): string | null {
    if (!token || token.length > 512) return null;
    const [body, mac, extra] = token.split(".");
    if (!body || !mac || extra !== undefined) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let payload: Payload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    } catch {
      return null;
    }
    if (payload.u !== userId || typeof payload.n !== "string" || typeof payload.e !== "number") {
      return null;
    }
    if (payload.e <= now) return null;
    if (payload.c !== this.credentialTag(passwordHash)) return null;
    return payload.n;
  }

  private credentialTag(passwordHash: string | null): string {
    return createHmac("sha256", this.key)
      .update(`password:${passwordHash ?? ""}`)
      .digest("base64url")
      .slice(0, 22);
  }

  private mac(body: string): string {
    return createHmac("sha256", this.key).update(body).digest("base64url");
  }
}
