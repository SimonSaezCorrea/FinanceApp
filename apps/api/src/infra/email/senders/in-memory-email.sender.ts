import type { EmailSenderPort, OutgoingEmail } from "../email-sender.port";

/** Tests only: keeps every email in memory so a test can read the link it carries. `failNext`
 * and `delayMs` let a test prove that a failing or slow email never affects the response. */
export class InMemoryEmailSender implements EmailSenderPort {
  readonly available = true;
  readonly sent: OutgoingEmail[] = [];
  failNext = false;
  delayMs = 0;

  async send(email: OutgoingEmail): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failNext) {
      this.failNext = false;
      throw new Error("in-memory sender: simulated failure");
    }
    this.sent.push(email);
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** The last email sent to `to` of a kind, if any. */
  last(to: string, kind?: OutgoingEmail["kind"]): OutgoingEmail | undefined {
    return [...this.sent].reverse().find((e) => e.to === to && (!kind || e.kind === kind));
  }
}

/** The first link in an email's plain-text body (the button's target). */
export function firstLink(email: OutgoingEmail): string | null {
  return email.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

/** The `token` query parameter of an email's first link. */
export function tokenFrom(email: OutgoingEmail): string | null {
  const link = firstLink(email);
  return link ? new URL(link).searchParams.get("token") : null;
}
