import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { StringValue } from "ms";

import { getPasskeyChallengeSecret } from "../../../infra/config/passkey.config";
import { PasskeyChallengeInvalidError } from "../domain/errors";

const PURPOSE = "passkey-challenge";
const EXPIRES: StringValue = "5m";

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

  issue(payload: PasskeyChallengePayload): string {
    return this.jwt.sign(
      { ...payload, purpose: PURPOSE },
      { secret: getPasskeyChallengeSecret(this.config), expiresIn: EXPIRES },
    );
  }

  verify(token: string): PasskeyChallengePayload {
    let decoded: PasskeyChallengePayload & { purpose?: string };
    try {
      decoded = this.jwt.verify<PasskeyChallengePayload & { purpose?: string }>(token, {
        secret: getPasskeyChallengeSecret(this.config),
      });
    } catch {
      throw new PasskeyChallengeInvalidError();
    }
    if (decoded.purpose !== PURPOSE) throw new PasskeyChallengeInvalidError();
    return {
      challenge: decoded.challenge,
      userId: decoded.userId,
      discoverable: decoded.discoverable,
    };
  }
}
