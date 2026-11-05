import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { auth } from "@finance/contracts";

import { getMfaEncryptionKey } from "../../../infra/config/mfa.config";
import { generateRowId } from "../../../infra/id/generate-row-id";
import {
  generateMfaCode,
  mfaCodeExpiry,
  oneHourBefore,
  resendWaitSeconds,
  type MfaCodePurpose,
} from "../../mfa-code/domain/mfa-code";
import {
  MFA_CODE_REPOSITORY,
  type MfaCodeRepositoryPort,
} from "../../mfa-code/domain/ports/mfa-code.repository.port";
import {
  EmailUnavailableError,
  MfaCodeRateLimitedError,
  MfaEmailNotVerifiedError,
} from "../domain/errors";
import { deriveMfaCodeKey, hashMfaCode, verifyMfaCode } from "./mfa-code-hash";
import { MFA_CODE_SENDER, type MfaCodeSenderPort } from "./mfa-code-sender";

export interface MfaCodeRecipient {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  locale: string;
}

/** What happened to a send. Never thrown by `issueAndSend`: each caller decides (login answers
 * `codeSent: false`, the profile endpoints answer an error). */
export type MfaCodeSendOutcome =
  | { sent: true }
  | { sent: false; reason: "rate-limited"; retryAfterSeconds: number }
  | { sent: false; reason: "not-verified" | "unavailable" | "failed" };

/**
 * Issues, sends and checks second-factor codes (specs/040 US3). Codes go only to a CONFIRMED
 * email; one per `MFA_CODE_RESEND_SECONDS` and at most `MFA_CODE_MAX_PER_HOUR` per hour and
 * purpose; a newer code replaces the previous one of the same purpose.
 */
@Injectable()
export class MfaCodeService {
  private readonly logger = new Logger(MfaCodeService.name);
  private key: Buffer | null = null;

  constructor(
    @Inject(MFA_CODE_REPOSITORY) private readonly codes: MfaCodeRepositoryPort,
    @Inject(MFA_CODE_SENDER) private readonly sender: MfaCodeSenderPort,
    private readonly config: ConfigService,
  ) {}

  async issueAndSend(
    recipient: MfaCodeRecipient,
    purpose: MfaCodePurpose,
    now: Date = new Date(),
  ): Promise<MfaCodeSendOutcome> {
    if (!recipient.email || !recipient.emailVerified)
      return { sent: false, reason: "not-verified" };
    if (!this.sender.available) return { sent: false, reason: "unavailable" };

    const issuedLastHour = await this.codes.issuedSince(
      recipient.userId,
      purpose,
      oneHourBefore(now),
    );
    const wait = resendWaitSeconds({ now, issuedLastHour });
    if (wait > 0) return { sent: false, reason: "rate-limited", retryAfterSeconds: wait };

    const id = generateRowId();
    const code = generateMfaCode();
    const { issued } = await this.codes.issue({
      id,
      userId: recipient.userId,
      purpose,
      channel: this.sender.channel,
      codeHash: hashMfaCode(this.hmacKey(), id, code),
      createdAt: now,
      expiresAt: mfaCodeExpiry(now),
    });
    // A concurrent request issued one first (partial unique index): its email is on its way.
    if (!issued) {
      return {
        sent: false,
        reason: "rate-limited",
        retryAfterSeconds: auth.MFA_CODE_RESEND_SECONDS,
      };
    }

    try {
      await this.sender.send({
        id,
        to: recipient.email,
        locale: recipient.locale,
        purpose,
        code,
      });
      return { sent: true };
    } catch (err) {
      // The code stays issued: the person can ask for another or use a recovery code.
      this.logger.error(`Could not send a ${purpose} code: ${String(err)}`);
      return { sent: false, reason: "failed" };
    }
  }

  /** The same send, for endpoints that answer an error when nothing went out. */
  async issueAndSendOrThrow(recipient: MfaCodeRecipient, purpose: MfaCodePurpose): Promise<void> {
    const outcome = await this.issueAndSend(recipient, purpose);
    if (outcome.sent) return;
    if (outcome.reason === "rate-limited") {
      throw new MfaCodeRateLimitedError(outcome.retryAfterSeconds);
    }
    if (outcome.reason === "not-verified") throw new MfaEmailNotVerifiedError();
    throw new EmailUnavailableError();
  }

  /**
   * Whether `code` is the account's active code of the purpose, consuming it inside `tx` (a
   * conditional update: two requests with the same code, only one wins). The caller counts a
   * `false` as a failed attempt.
   */
  async verifyWithTx(
    tx: unknown,
    userId: string,
    purpose: MfaCodePurpose,
    code: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    const active = await this.codes.findActive(userId, purpose, now);
    if (!active || !verifyMfaCode(this.hmacKey(), active.id, code, active.codeHash)) return false;
    return this.codes.consumeWithTx(tx, active.id, now);
  }

  /** Voids a pending code (e.g. an email setup replaced by an app one). */
  revokeWithTx(tx: unknown, userId: string, purpose: MfaCodePurpose, now: Date = new Date()) {
    return this.codes.revokeActiveWithTx(tx, userId, purpose, now);
  }

  private hmacKey(): Buffer {
    this.key ??= deriveMfaCodeKey(getMfaEncryptionKey(this.config));
    return this.key;
  }
}
