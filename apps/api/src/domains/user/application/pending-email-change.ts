import type { EmailTokenRepositoryPort } from "../../email-token/domain/ports/email-token.repository.port";
import type { UserEmailRepositoryPort } from "../../user-email/domain/ports/user-email.repository.port";

/**
 * Cancels a requested email change inside the caller's transaction (security run-3): the pending
 * address moves to history and every confirmation link stops working.
 *
 * Without it, a change requested from a stolen session survived everything the owner does on
 * noticing (changing or recovering the password), and its link — opened on a public route, no
 * session needed — could still make the attacker's address the primary, which then recovers the
 * password. Changing and recovering the password call this; the "change requested" notice tells
 * the owner that is how to stop it.
 *
 * Revoking VERIFY_EMAIL also voids a link confirming an unconfirmed PRIMARY; it can be resent.
 */
export async function cancelPendingEmailChangeWithTx(
  deps: { emails: UserEmailRepositoryPort; tokens: EmailTokenRepositoryPort },
  tx: unknown,
  userId: string,
  now: Date,
): Promise<void> {
  await deps.emails.cancelPendingWithTx(tx, userId, now);
  await deps.tokens.revokeActiveWithTx(tx, userId, "VERIFY_EMAIL", now);
}
