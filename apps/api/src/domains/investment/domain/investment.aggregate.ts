import type { investments } from "@finance/contracts";

export interface InvestmentProps {
  id: string;
  userId: string;
  kind: investments.InvestmentKind;
  label: string;
  currency: string;
  symbol: string | null;
  shares: string | null;
  annualRate: string | null;
  principal: string | null;
  bankAccountId: string | null;
  openedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InvestmentPatch = Partial<{
  kind: investments.InvestmentKind;
  label: string;
  currency: string;
  symbol: string | null;
  shares: string | null;
  annualRate: string | null;
  principal: string | null;
  bankAccountId: string | null;
  openedAt: Date | null;
}>;

/** A brand-new investment, as planned by `Investment.planCreation` — no
 * `id`/`userId`/timestamps yet (the repository adapter assigns them on
 * insert, `userId` supplied separately to `create(userId, plan)`, same
 * convention as `debts`' `PlannedDebt`). */
export type PlannedInvestment = Omit<InvestmentProps, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * `Investment` aggregate: an ETF holding or remunerated (interest-bearing)
 * account tracked for the user, optionally linked to a `BankAccount`. No
 * state-machine invariants beyond plain CRUD — the pre-migration
 * `InvestmentsService` had none either, so this aggregate's job is purely to
 * own the persisted shape and the raw-string decimal passthrough (money
 * fields cross the boundary as the exact string the DB returns, no fixed-scale
 * `moneyToString` formatting — see `packages/contracts/src/investments` and
 * the pre-migration test asserting `"12.34567890"`/`"0.045000"` pass through
 * unchanged).
 *
 * ETF live-quote fetching (Alpha Vantage) is a DEFERRED feature (see
 * `CLAUDE.md`) — no stub exists in the pre-migration source to preserve, so
 * none is added here either.
 */
export class Investment {
  private constructor(private props: InvestmentProps) {}

  static fromPersistence(props: InvestmentProps): Investment {
    return new Investment({ ...props });
  }

  /** Factory Method (FR-008): plans a brand-new investment's persisted shape
   * from validated `CreateInvestment` input — `id`/`createdAt`/`updatedAt`
   * stay a persistence concern. */
  static planCreation(input: {
    kind: investments.InvestmentKind;
    label: string;
    currency: string;
    symbol?: string;
    shares?: string;
    annualRate?: string;
    principal?: string;
    bankAccountId?: string;
    openedAt?: Date;
  }): PlannedInvestment {
    return {
      kind: input.kind,
      label: input.label,
      currency: input.currency,
      symbol: input.symbol ?? null,
      shares: input.shares ?? null,
      annualRate: input.annualRate ?? null,
      principal: input.principal ?? null,
      bankAccountId: input.bankAccountId ?? null,
      openedAt: input.openedAt ?? null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }

  /** Apply a partial patch to the investment's own scalar fields. */
  applyUpdate(patch: InvestmentPatch): void {
    if (patch.kind !== undefined) this.props.kind = patch.kind;
    if (patch.label !== undefined) this.props.label = patch.label;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.symbol !== undefined) this.props.symbol = patch.symbol;
    if (patch.shares !== undefined) this.props.shares = patch.shares;
    if (patch.annualRate !== undefined) this.props.annualRate = patch.annualRate;
    if (patch.principal !== undefined) this.props.principal = patch.principal;
    if (patch.bankAccountId !== undefined) this.props.bankAccountId = patch.bankAccountId;
    if (patch.openedAt !== undefined) this.props.openedAt = patch.openedAt;
  }

  snapshot(): Readonly<InvestmentProps> {
    return this.props;
  }

  toContract(): investments.Investment {
    return {
      id: this.props.id,
      kind: this.props.kind,
      label: this.props.label,
      currency: this.props.currency,
      symbol: this.props.symbol,
      shares: this.props.shares,
      annualRate: this.props.annualRate,
      principal: this.props.principal,
      bankAccountId: this.props.bankAccountId,
      openedAt: this.props.openedAt ? this.props.openedAt.toISOString() : null,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
