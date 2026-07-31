/** Published when a `User` transitions ACTIVE -> DISABLED (soft-disable, FR-... mirrors
 * `accounts`' `AccountDeactivatedEvent` shape/precedent for this domain). */
export class UserDeactivatedEvent {
  constructor(public readonly userId: string) {}
}
