import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { StringValue } from "ms";

import { claimOnce } from "../../../infra/auth/one-time-claims";
import { getPasskeyChallengeSecret } from "../../../infra/config/passkey.config";
import { PasskeyChallengeInvalidError } from "../domain/errors";

const PURPOSE = "passkey-challenge";
const EXPIRES: StringValue = "5m";

/** Which ceremony a challenge was issued for (security run-4 hardening): a login challenge can't
 * be presented to register-verify, nor a registration one to a login. */
export type PasskeyCeremony = "login" | "register" | "step-up";

export interface PasskeyChallengePayload {
  challenge: string;
  /**
   * `null` either because the login email didn't resolve to a user with any passkeys (carried
   * through so `verify` can fail generically without a second lookup, FR-005a), OR because this
   * is a discoverable/"usernameless" login (no email was given at all) — `discoverable`
   * disambiguates which one, since the two need different handling at verify time.
   */
  userId: string | null;
  /** `true` when no email was given at `start-passkey-login` — the account is resolved from
   * whichever credential the browser's own account picker returns, not pre-sealed here. */
  discoverable: boolean;
}

/**
 * Signs/verifies the short-lived (5min) cookie that bridges the two steps of a WebAuthn
 * ceremony (request options → verify response) — same mechanism and same "separate secret from
 * session JWTs" discipline as `TokenIssuer`'s own `issueMfaPending`/`verifyMfaPending`.
 */
@Injectable()
export class PasskeyChallengeToken {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issue(payload: PasskeyChallengePayload, ceremony: PasskeyCeremony): string {
    return this.jwt.sign(
      { ...payload, purpose: PURPOSE, ceremony, jti: randomUUID() },
      { secret: getPasskeyChallengeSecret(this.config), expiresIn: EXPIRES },
    );
  }

  /**
   * Single-use (security run-3): the first `verify` of a challenge claims it, and any later one
   * — a replayed cookie together with a captured response — is refused. A failed ceremony asks
   * for new options anyway, so nothing legitimate presents the same challenge twice. A token
   * signed before challenges carried a `jti` (at most 5 minutes after a deploy) is still taken.
   */
  verify(token: string, ceremony: PasskeyCeremony): PasskeyChallengePayload {
    let decoded: PasskeyChallengePayload & {
      purpose?: string;
      ceremony?: string;
      jti?: string;
      exp?: number;
    };
    try {
      decoded = this.jwt.verify<
        PasskeyChallengePayload & {
          purpose?: string;
          ceremony?: string;
          jti?: string;
          exp?: number;
        }
      >(token, {
        secret: getPasskeyChallengeSecret(this.config),
      });
    } catch {
      throw new PasskeyChallengeInvalidError();
    }
    if (decoded.purpose !== PURPOSE) throw new PasskeyChallengeInvalidError();
    // A challenge signed before it named its ceremony (at most 5 minutes after a deploy) is taken.
    if (decoded.ceremony !== undefined && decoded.ceremony !== ceremony) {
      throw new PasskeyChallengeInvalidError();
    }
    if (decoded.jti && !claimOnce(`passkey:${decoded.jti}`, (decoded.exp ?? 0) * 1000)) {
      throw new PasskeyChallengeInvalidError();
    }
    return {
      challenge: decoded.challenge,
      userId: decoded.userId,
      discoverable: decoded.discoverable,
    };
  }
}
