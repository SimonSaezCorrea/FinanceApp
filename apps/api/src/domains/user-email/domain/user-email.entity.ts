/**
 * `user-email` table — one address an account has had or asked to have (specs/032). Not an
 * aggregate root: it only ever exists under a `User` and is written through the `user` domain's
 * email commands. This domain owns the table's shape and its few row-level rules; the flows
 * (verify, change, delete) live in `user/application`.
 */
export type UserEmailStatus = "PRIMARY" | "PENDING" | "PAST";

export interface UserEmailProps {
  id: string;
  userId: string;
  /** Trimmed and lower-cased (`normalizeEmailAddress`). */
  address: string;
  status: UserEmailStatus;
  verifiedAt: Date | null;
  createdAt: Date;
  replacedAt: Date | null;
}

/** The one canonical form an address is stored and compared in. */
export function normalizeEmailAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** The primary is the address that receives emails and recovers the password: it can be
 * replaced (by confirming a pending one) but never deleted. */
export function isDeletable(email: Pick<UserEmailProps, "status">): boolean {
  return email.status !== "PRIMARY";
}

/** Whether a link sent to this row can still confirm it: a pending address, or the primary
 * while it is unconfirmed. A row that moved to history (replaced, or a newer pending took its
 * place) can't be confirmed any more. */
export function isConfirmable(email: Pick<UserEmailProps, "status" | "verifiedAt">): boolean {
  if (email.status === "PENDING") return true;
  return email.status === "PRIMARY" && email.verifiedAt === null;
}

const ORDER: Record<UserEmailStatus, number> = { PRIMARY: 0, PENDING: 1, PAST: 2 };

/** Primary first, then the pending one, then history from the most recent. */
export function sortForDisplay(emails: readonly UserEmailProps[]): UserEmailProps[] {
  return [...emails].sort((a, b) => {
    const byStatus = ORDER[a.status] - ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const aTime = (a.replacedAt ?? a.createdAt).getTime();
    const bTime = (b.replacedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}
