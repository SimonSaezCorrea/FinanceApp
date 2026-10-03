/** Published when a `User` is deleted (Ley 21.719 Art. 11 supresión) — PII scrubbed, account
 * permanently unreachable. Replaces the old `UserDeactivatedEvent`: this app no longer has a
 * soft-disable state, only this one-way transition. */
export class UserAccountDeletedEvent {
  constructor(public readonly userId: string) {}
}
