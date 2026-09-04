import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class PayInstallmentCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly planId: string,
    public readonly sequence: number,
    /** The account the money leaves. Null on a CREDIT-card plan, which records no
     *  movement at all — that debt is already on the card's statement (FR-035). */
    public readonly fromAccountId: string | null,
    /** Credited to the DEBT, in the PLAN's currency. Null = everything owed. */
    public readonly amount: string | null,
    /** Charged to the ACCOUNT, in ITS currency. Required only when the two differ:
     *  with no exchange rate anywhere in this app, only the user knows it (FR-029). */
    public readonly chargedAmount: string | null,
    /** Real date of payment; null = now. Dates the created expense too (FR-019). */
    public readonly paidAt: Date | null,
    public readonly idempotencyKey: string,
  ) {}
}
