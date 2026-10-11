import type { EmailSenderPort, OutgoingEmail } from "../email-sender.port";
import { EMAIL_LOGO_CONTENT_ID } from "../templates/layout";
import { EMAIL_LOGO_PNG_BASE64 } from "../templates/logo.generated";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * Real delivery through Resend's REST API (research.md R2), with native `fetch` — no SDK. Only
 * ever built in production with a key (`email.config.ts`). The email's id is the
 * `Idempotency-Key`, so a retried request can't deliver it twice.
 */
export class ResendEmailSender implements EmailSenderPort {
  readonly available = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string,
  ) {}

  async send(email: OutgoingEmail): Promise<void> {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.id,
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        reply_to: this.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: "kind", value: email.kind }],
        // The layout's logo travels inside the email (`cid:`), not as a link to the site.
        attachments: [
          {
            filename: "fik.png",
            content: EMAIL_LOGO_PNG_BASE64,
            content_type: "image/png",
            content_id: EMAIL_LOGO_CONTENT_ID,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // The body names the problem (e.g. an unverified domain); never the API key.
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend rejected the email (${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}
