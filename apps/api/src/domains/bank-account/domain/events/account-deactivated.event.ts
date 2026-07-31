/** Published when a BankAccount transitions to INACTIVE. */
export class AccountDeactivatedEvent {
  constructor(public readonly accountId: string) {}
}
