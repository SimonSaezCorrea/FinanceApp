import { EmailRateLimitedError, EmailUnavailableError } from "../domain/errors";
import type { LinkOutcome } from "./account-emails";

/** For the endpoints whose whole purpose is sending a link (resend, change email): a link that
 * couldn't go out is an error the person should see. `recent` is success — the email sent a few
 * seconds ago is on its way. */
export function assertLinkSent(outcome: LinkOutcome): void {
  if (outcome === "rate-limited") throw new EmailRateLimitedError();
  if (outcome === "unavailable" || outcome === "failed") throw new EmailUnavailableError();
}
