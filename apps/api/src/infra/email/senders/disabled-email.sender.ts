import { Logger } from "@nestjs/common";

import type { EmailSenderPort, OutgoingEmail } from "../email-sender.port";

/** Production without `RESEND_API_KEY`: sending is off, not broken (FR-005). Callers check
 * `available` to tell the person; anything sent anyway is dropped with a warning. */
export class DisabledEmailSender implements EmailSenderPort {
  readonly available = false;
  private readonly logger = new Logger("Email");

  async send(email: OutgoingEmail): Promise<void> {
    this.logger.warn(`Email sending is not configured — ${email.kind} not sent`);
  }
}
