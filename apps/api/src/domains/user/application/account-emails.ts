import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  MAX_TOKENS_PER_HOUR,
  expiresAtFor,
  generateToken,
  isWithinResendWindow,
  oneHourBefore,
  type EmailTokenPurpose,
} from "../../email-token/domain/email-token";
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepositoryPort,
} from "../../email-token/domain/ports/email-token.repository.port";
import {
  EMAIL_SENDER,
  type EmailSenderPort,
  type OutgoingEmail,
} from "../../../infra/email/email-sender.port";
import type { EmailConfig } from "../../../infra/email/email.config";
import { EMAIL_CONFIG } from "../../../infra/email/email.tokens";
import { emailLocale } from "../../../infra/email/i18n";
import { renderResetPassword } from "../../../infra/email/templates/reset-password";
import {
  renderSecurityNotice,
  type SecurityNoticeKind,
} from "../../../infra/email/templates/security-notice";
import { renderVerifyEmail } from "../../../infra/email/templates/verify-email";
import { generateRowId } from "../../../infra/id/generate-row-id";

/** What happened to a link request — the handlers turn it into a response or an error. */
export type LinkOutcome = "sent" | "recent" | "rate-limited" | "unavailable" | "failed";

interface Recipient {
  userId: string;
  locale: string;
}

/**
 * The ONE place that issues email links and sends account emails (specs/032). Never throws:
 * every outcome is returned or logged, so no caller can fail an action because an email did
 * (FR-006). Links open the public site in the account's language (FR-010a, research.md R7).
 */
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);

  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSenderPort,
    @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
    @Inject(EMAIL_TOKEN_REPOSITORY) private readonly tokens: EmailTokenRepositoryPort,
  ) {}

  /** False in production without a provider: screens that depend on an email say so. */
  get available(): boolean {
    return this.sender.available;
  }

  /** "Confirma tu correo" for one address of the account (its primary, or a pending one). */
  sendVerification(
    recipient: Recipient,
    email: { id: string; address: string },
  ): Promise<LinkOutcome> {
    return this.sendLink(recipient, "VERIFY_EMAIL", email.address, email.id, (link) =>
      renderVerifyEmail({ ...this.base(recipient), address: email.address, link }),
    );
  }

  /** "Recupera tu cuenta" to the account's confirmed primary address. */
  sendPasswordReset(recipient: Recipient, address: string): Promise<LinkOutcome> {
    return this.sendLink(recipient, "RESET_PASSWORD", address, null, (link) =>
      renderResetPassword({ ...this.base(recipient), link }),
    );
  }

  /** A security notice (US3). Errors are logged, never thrown. */
  async sendSecurityNotice(input: {
    to: string;
    locale: string;
    kind: SecurityNoticeKind;
    occurredAt: Date;
    detail?: string;
  }): Promise<void> {
    const locale = emailLocale(input.locale);
    const rendered = renderSecurityNotice({
      locale,
      siteUrl: this.config.publicSiteUrl,
      contact: this.config.replyTo,
      kind: input.kind,
      occurredAt: input.occurredAt,
      detail: input.detail,
    });
    await this.deliver({
      id: generateRowId(),
      kind: "security-notice",
      to: input.to,
      locale,
      ...rendered,
    });
  }

  private base(recipient: Recipient) {
    return {
      locale: emailLocale(recipient.locale),
      siteUrl: this.config.publicSiteUrl,
      contact: this.config.replyTo,
    };
  }

  private async sendLink(
    recipient: Recipient,
    purpose: EmailTokenPurpose,
    address: string,
    userEmailId: string | null,
    render: (link: string) => { subject: string; html: string; text: string },
  ): Promise<LinkOutcome> {
    try {
      if (!this.sender.available) return "unavailable";
      const now = new Date();

      // A link of the same kind (for the same address) sent less than a minute ago is reused:
      // a double click or a retried request doesn't send a second email (research.md R10).
      const active = await this.tokens.findActive(recipient.userId, purpose);
      if (
        active &&
        isWithinResendWindow(active.createdAt, now) &&
        active.userEmailId === userEmailId
      ) {
        return "recent";
      }
      const recent = await this.tokens.countSince(recipient.userId, purpose, oneHourBefore(now));
      if (recent >= MAX_TOKENS_PER_HOUR) return "rate-limited";

      const { token, tokenHash } = generateToken();
      const issued = await this.tokens.issue({
        userId: recipient.userId,
        purpose,
        userEmailId,
        tokenHash,
        expiresAt: expiresAtFor(purpose, now),
      });
      // A concurrent request issued one first (the partial unique index): that one's email is
      // on its way, this one sends nothing.
      if (!issued.issued) return "recent";

      const locale = emailLocale(recipient.locale);
      const page = purpose === "VERIFY_EMAIL" ? "verify-email" : "reset-password";
      const link = `${this.config.publicSiteUrl}/${locale}/${page}/?token=${token}`;
      const delivered = await this.deliver({
        id: issued.id,
        kind: page,
        to: address,
        locale,
        ...render(link),
      });
      return delivered ? "sent" : "failed";
    } catch (err) {
      this.logger.error(`Could not issue a ${purpose} link: ${String(err)}`);
      return "failed";
    }
  }

  /** Sends, logging (never throwing) a failure. Returns whether it went out. */
  private async deliver(email: OutgoingEmail): Promise<boolean> {
    try {
      await this.sender.send(email);
      return true;
    } catch (err) {
      this.logger.error(`Could not send ${email.kind}: ${String(err)}`);
      return false;
    }
  }
}
