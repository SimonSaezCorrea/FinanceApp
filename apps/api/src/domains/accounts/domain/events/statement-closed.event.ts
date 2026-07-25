/** Published when an OPEN CreditStatement is sealed (closed) by generation
 * (manual button or cron) — it stops accepting new linked transactions. */
export class StatementClosedEvent {
  constructor(
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly periodStart: Date,
    public readonly closedAt: Date,
  ) {}
}
