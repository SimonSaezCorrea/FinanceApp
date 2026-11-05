import { Inject, Injectable } from "@nestjs/common";

import type { MfaCodeChannel, MfaCodePurpose } from "../../mfa-code/domain/mfa-code";
import { EMAIL_SENDER, type EmailSenderPort } from "../../../infra/email/email-sender.port";
import type { EmailConfig } from "../../../infra/email/email.config";
import { EMAIL_CONFIG } from "../../../infra/email/email.tokens";
import { emailLocale } from "../../../infra/email/i18n";
import { renderMfaCode } from "../../../infra/email/templates/mfa-code";

export const MFA_CODE_SENDER = Symbol("MFA_CODE_SENDER");

export interface MfaCodeMessage {
  /** The code row's id — also the provider's idempotency key. */
  id: string;
  /** The channel's address (today: a confirmed email). */
  to: string;
  locale: string;
  purpose: MfaCodePurpose;
  code: string;
}

/**
 * Delivers a second-factor code through ONE channel (specs/040 FR-027). The flow only knows this
 * port, so another channel (WhatsApp) is another implementation, not another flow. `send` may
 * throw; the caller logs it and never fails the action because of it.
 */
export interface MfaCodeSenderPort {
  readonly channel: MfaCodeChannel;
  readonly available: boolean;
  send(message: MfaCodeMessage): Promise<void>;
}

/** The email channel, over the existing account-email sender. */
@Injectable()
export class EmailMfaCodeSender implements MfaCodeSenderPort {
  readonly channel = "EMAIL" as const;

  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSenderPort,
    @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
  ) {}

  get available(): boolean {
    return this.sender.available;
  }

  async send(message: MfaCodeMessage): Promise<void> {
    const locale = emailLocale(message.locale);
    const rendered = renderMfaCode({
      locale,
      siteUrl: this.config.publicSiteUrl,
      contact: this.config.replyTo,
      purpose: message.purpose,
      code: message.code,
    });
    await this.sender.send({
      id: message.id,
      kind: "mfa-code",
      to: message.to,
      locale,
      ...rendered,
    });
  }
}
