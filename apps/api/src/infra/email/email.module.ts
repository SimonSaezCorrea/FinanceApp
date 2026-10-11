import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { EMAIL_SENDER, type EmailSenderPort } from "./email-sender.port";
import { EMAIL_CONFIG } from "./email.tokens";
import { readEmailConfig, type EmailConfig } from "./email.config";
import { DisabledEmailSender } from "./senders/disabled-email.sender";
import { ResendEmailSender } from "./senders/resend-email.sender";

function senderFor(config: EmailConfig): EmailSenderPort {
  switch (config.delivery) {
    case "resend":
      return new ResendEmailSender(config.resendApiKey ?? "", config.from, config.replyTo);
    case "disabled":
      return new DisabledEmailSender();
  }
}

/**
 * Outgoing email (specs/032), cross-cutting like `infra/cron` or `infra/http`: decides once at
 * boot where emails go and exposes it as `EMAIL_SENDER` (plus `EMAIL_CONFIG`, for the links'
 * base URL and the contact address). Global so any domain can send without importing it.
 */
@Global()
@Module({
  providers: [
    { provide: EMAIL_CONFIG, inject: [ConfigService], useFactory: readEmailConfig },
    {
      provide: EMAIL_SENDER,
      inject: [EMAIL_CONFIG],
      useFactory: (config: EmailConfig): EmailSenderPort => {
        new Logger("Email").log(`Email delivery: ${config.delivery}`);
        return senderFor(config);
      },
    },
  ],
  exports: [EMAIL_SENDER, EMAIL_CONFIG],
})
export class EmailModule {}
