import { type accounts, installments } from "@finance/contracts";
import { addMoney, equalPrincipalSchedule, moneyToString, sumMoney, toMoney } from "@finance/money";

import {
  InstallmentCardIsCreditError,
  InstallmentPaymentAlreadyPaidError,
  InstallmentPaymentNotFoundError,
  InstallmentPlanBilledError,
  InstallmentPlanSettledError,
  InvalidPaymentAmountError,
  PaymentExceedsRemainingError,
} from "./errors";
import {
  applyCarryOver,
  type CarryablePayment,
  type CarryDelta,
  outstandingOn,
  outstandingTotal,
  owedBy,
  reverseCarryOver,
} from "./installment-carry-over";

export interface InstallmentPaymentProps {
  id: string;
  sequence: number;
  dueDate: Date;
  amount: string;
  paidAt: Date | null;
  /** What was actually paid; null on a row paid before this feature existed. */
  paidAmount: string | null;
  /** Inherited from the previous instalment; negative if that one was overpaid. */
  carriedOverAmount: string;
  /** The real expense backing this instalment, when there is one. */
  transactionId: string | null;
  /** The billing period that CHARGED this instalment (spec 014); null while unbilled.
   * Only ever set on a plan bought with a CREDIT card. Kept after settlement so the
   * plan can link back to the period that settled it (FR-020). */
  creditStatementId: string | null;
}

export interface InstallmentPlanProps {
  id: string;
  userId: string;
  title: string;
  totalPrincipal: string;
  installmentCount: number;
  startDate: Date;
  currency: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  /** The card the purchase was made with, when there was one. */
  cardId: string | null;
  /** Free text, same repertoire as a movement's category. */
  category: string | null;
  /** The account remembered to pre-fill each payment form. */
  paymentAccountId: string | null;
  notes: string | null;
  payments: InstallmentPaymentProps[];
  createdAt: Date;
  updatedAt: Date;
}

export type InstallmentPlanPatch = Partial<{
  title: string;
  currency: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  cardId: string | null;
  category: string | null;
  paymentAccountId: string | null;
  notes: string | null;
}>;

/** A brand-new plan's payments, as planned by `planCreation` — no `id` yet
 * (the repository adapter assigns it on insert). */
export type PlannedPayment = { sequence: number; dueDate: Date; amount: string };

/**
 * `InstallmentPlan` aggregate: a purchase paid off in scheduled installments
 * (`InstallmentPayment` children). Owns the schedule-generation invariant
 * (equal-principal amortization via `@finance/money`, due dates stepped by
 * frequency x interval) and the pay/unpay invariant (a payment must exist on
 * this plan to be marked paid/unpaid — `INSTALLMENT_PAYMENT_NOT_FOUND`
 * otherwise). Marking paid/unpaid is intentionally idempotent (mirrors the
 * pre-migration `InstallmentsRepository.markPaid`/`markUnpaid`, which just set
 * `paidAt` regardless of its previous value) — this domain has no
 * "already paid" error.
 */
export class InstallmentPlan {
  private constructor(private props: InstallmentPlanProps) {}

  static fromPersistence(props: InstallmentPlanProps): InstallmentPlan {
    return new InstallmentPlan({ ...props, payments: props.payments.map((p) => ({ ...p })) });
  }

  /**
   * Factory Method (FR-008): plans a brand-new plan's schedule — equal
   * principal per installment (optionally with simple interest via
   * `aprPerPeriod`), due dates stepped `frequency x frequencyInterval` from
   * `startDate`. Returns plain data the infrastructure adapter inserts; `id`
   * assignment stays a persistence concern (Prisma's `@default(cuid())`).
   */
  static planCreation(input: {
    title: string;
    totalPrincipal: string;
    installmentCount: number;
    startDate: Date;
    currency: string;
    frequency: installments.InstallmentFrequency;
    frequencyInterval: number;
    aprPerPeriod?: string;
    cardId?: string | null;
    category?: string | null;
    paymentAccountId?: string | null;
    notes?: string | null;
  }): {
    title: string;
    totalPrincipal: string;
    installmentCount: number;
    startDate: Date;
    currency: string;
    frequency: installments.InstallmentFrequency;
    frequencyInterval: number;
    cardId: string | null;
    category: string | null;
    paymentAccountId: string | null;
    notes: string | null;
    payments: PlannedPayment[];
  } {
    const schedule = equalPrincipalSchedule({
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      aprPerPeriod: input.aprPerPeriod,
    });
    const payments: PlannedPayment[] = schedule.map((row) => ({
      sequence: row.sequence,
      dueDate: addPeriod(
        input.startDate,
        row.sequence - 1,
        input.frequency,
        input.frequencyInterval,
      ),
      amount: row.payment,
    }));
    return {
      title: input.title,
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      startDate: input.startDate,
      currency: input.currency,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
      cardId: input.cardId ?? null,
      category: input.category ?? null,
      paymentAccountId: input.paymentAccountId ?? null,
      notes: input.notes ?? null,
      payments,
    };
  }

  /**
   * INV-P2: a plan bought with a CREDIT card never pays an instalment with money —
   * that debt is already on the card's statement (FR-035). Remembering an account to
   * pay it from would promise a movement that will never be recorded, so the two
   * facts are refused together rather than one of them silently ignored.
   */
  static assertPaymentAccountAllowed(
    cardKind: accounts.CardKind | null,
    paymentAccountId: string | null | undefined,
  ): void {
    if (!paymentAccountId) return;
    if (!installments.generatesMovementOnPay(cardKind)) throw new InstallmentCardIsCreditError();
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get title(): string {
    return this.props.title;
  }
  get totalPrincipal(): string {
    return moneyToString(this.props.totalPrincipal);
  }
  get installmentCount(): number {
    return this.props.installmentCount;
  }
  get startDate(): Date {
    return this.props.startDate;
  }
  get currency(): string {
    return this.props.currency;
  }
  get frequency(): installments.InstallmentFrequency {
    return this.props.frequency;
  }
  get frequencyInterval(): number {
    return this.props.frequencyInterval;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get payments(): readonly InstallmentPaymentProps[] {
    return this.props.payments;
  }

  /** Whether any instalment has been charged into a billing period (spec 014) —
   * true for a CREDIT-card plan once its first period closes, always false for
   * every other kind of plan (nothing ever stamps their instalments). */
  hasBilledInstalment(): boolean {
    return this.props.payments.some((p) => p.creditStatementId !== null);
  }

  /**
   * Apply a partial patch to the plan's own scalar fields — the schedule
   * (payments, and with it `totalPrincipal`/`installmentCount`/`startDate`, which
   * are not even part of this patch type) is immutable once created, same as the
   * pre-migration `InstallmentsService.update`.
   *
   * Spec 014, FR-006b: once any instalment has been billed, `cardId` freezes too —
   * a billed period is a statement the user already saw; letting the plan behind
   * it change would leave that statement describing something that no longer
   * exists. Everything else (title, category, notes, currency, frequency) stays
   * editable — none of it is read by a closed period.
   */
  applyUpdate(patch: InstallmentPlanPatch): void {
    if (
      patch.cardId !== undefined &&
      patch.cardId !== this.props.cardId &&
      this.hasBilledInstalment()
    ) {
      throw new InstallmentPlanBilledError("cardId");
    }
    if (patch.title !== undefined) this.props.title = patch.title;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.frequency !== undefined) this.props.frequency = patch.frequency;
    if (patch.frequencyInterval !== undefined)
      this.props.frequencyInterval = patch.frequencyInterval;
    if (patch.cardId !== undefined) this.props.cardId = patch.cardId;
    if (patch.category !== undefined) this.props.category = patch.category;
    if (patch.paymentAccountId !== undefined) this.props.paymentAccountId = patch.paymentAccountId;
    if (patch.notes !== undefined) this.props.notes = patch.notes;
  }

  /**
   * Spec 014, FR-006a: refuses deletion once a billed instalment's period has been
   * SETTLED (`paidAt !== null`) — reversing it would mean undoing a real payment.
   * Strictly narrower than the edit freeze above: a plan whose instalments are
   * merely BILLED (period still PENDING) may still be deleted, because unwinding a
   * pending period touches no money.
   */
  assertDeletable(): void {
    const settled = this.props.payments.some((p) => p.creditStatementId !== null && p.paidAt);
    if (settled) throw new InstallmentPlanSettledError();
  }

  private findPaymentOrThrow(sequence: number): InstallmentPaymentProps {
    const payment = this.props.payments.find((p) => p.sequence === sequence);
    if (!payment) throw new InstallmentPaymentNotFoundError();
    return payment;
  }

  /** Marks a scheduled payment paid — `INSTALLMENT_PAYMENT_NOT_FOUND` if no
   * payment with that sequence exists on this plan. */
  markPaymentPaid(sequence: number): void {
    const payment = this.findPaymentOrThrow(sequence);
    payment.paidAt = new Date();
  }

  /** Clears a scheduled payment's paid status — same not-found invariant as
   * `markPaymentPaid`. */
  markPaymentUnpaid(sequence: number): void {
    const payment = this.findPaymentOrThrow(sequence);
    payment.paidAt = null;
  }

  /** Throws unless this plan really has that instalment. Called before any of the
   *  payment's OTHER preconditions, so "instalment 99 doesn't exist" is answered as
   *  such instead of as "choose a payment account". */
  assertHasInstallment(sequence: number): void {
    this.findPaymentOrThrow(sequence);
  }

  /** What one instalment owes: its scheduled amount plus any carry it inherited. */
  owedOn(sequence: number): string {
    return owedBy(this.toCarryable(this.findPaymentOrThrow(sequence)));
  }

  /**
   * Records a payment against one instalment and applies its carry-over.
   *
   * `amount` is what is credited to the DEBT, in the plan's currency — not what left
   * the account, which may be a different currency entirely and is the handler's
   * business, not the aggregate's. Omitted, it means "everything this instalment
   * owes".
   *
   * Returns the carry deltas so the handler can persist them in the same database
   * transaction as the expense and the balance; the aggregate has already applied
   * them to its own state.
   */
  payInstallment(
    sequence: number,
    amount: string | null,
    paidAt: Date,
    transactionId: string | null,
  ): { paidAmount: string; carryDeltas: CarryDelta[] } {
    const payment = this.findPaymentOrThrow(sequence);
    if (payment.paidAt !== null) throw new InstallmentPaymentAlreadyPaidError();

    const owed = owedBy(this.toCarryable(payment));
    const paidAmount = amount === null ? owed : moneyToString(amount);
    if (!toMoney(paidAmount).greaterThan(0)) throw new InvalidPaymentAmountError();

    const result = applyCarryOver(this.carryable(), sequence, paidAmount);
    // A surplus with no later instalment to absorb it is a payment the plan cannot
    // account for. Capping it silently would lose the difference; crediting it would
    // invent a balance in the user's favour that this domain has no concept of.
    if (toMoney(result.unappliedSurplus).greaterThan(0)) {
      throw new PaymentExceedsRemainingError();
    }

    payment.paidAmount = paidAmount;
    payment.transactionId = transactionId;
    // Settled only when the payment covered it, or when the shortfall found a
    // successor to move to. Otherwise the instalment stays open for the remainder.
    if (result.settled) payment.paidAt = paidAt;

    this.applyCarryDeltas(result.deltas);
    return { paidAmount, carryDeltas: result.deltas };
  }

  /**
   * Undoes a payment: clears the instalment, reverses the carry that payment caused,
   * and reports what the handler must reverse outside the aggregate — the expense to
   * delete and the balance to restore.
   *
   * What it deliberately does NOT touch is the carry this instalment RECEIVED: that
   * belongs to the previous payment, which still stands.
   */
  unpayInstallment(sequence: number): {
    transactionId: string | null;
    refundAmount: string;
    carryDeltas: CarryDelta[];
  } {
    const payment = this.findPaymentOrThrow(sequence);
    const transactionId = payment.transactionId;
    // A row paid before this feature has no recorded amount and no expense behind it,
    // so there is nothing to give back — inventing a figure would move a real balance
    // by a number nobody ever paid.
    const refundAmount = payment.paidAmount ?? "0.0000";

    const deltas = reverseCarryOver(this.carryOverCausedBy(payment));
    this.applyCarryDeltas(deltas);

    payment.paidAt = null;
    payment.paidAmount = null;
    payment.transactionId = null;

    return { transactionId, refundAmount, carryDeltas: deltas };
  }

  /** Recomputes what a payment of `paidAmount` moved, so undoing can reverse it
   *  without having stored the deltas. */
  private carryOverCausedBy(payment: InstallmentPaymentProps): CarryDelta[] {
    if (payment.paidAmount === null) return [];
    // Recomputed against the state as it was BEFORE this payment: the instalment
    // treated as unpaid again, which is exactly what `applyCarryOver` saw.
    const asBefore = this.carryable().map((p) =>
      p.sequence === payment.sequence ? { ...p, paidAt: null, paidAmount: null } : p,
    );
    return applyCarryOver(asBefore, payment.sequence, payment.paidAmount).deltas;
  }

  private applyCarryDeltas(deltas: CarryDelta[]): void {
    for (const { sequence, delta } of deltas) {
      const target = this.props.payments.find((p) => p.sequence === sequence);
      if (target) target.carriedOverAmount = addMoney(target.carriedOverAmount, delta);
    }
  }

  snapshot(): Readonly<InstallmentPlanProps> {
    return this.props;
  }

  /** The instalments as the carry-over arithmetic sees them. */
  private carryable(): CarryablePayment[] {
    return this.props.payments.map((p) => ({
      sequence: p.sequence,
      amount: p.amount,
      carriedOverAmount: p.carriedOverAmount,
      paidAt: p.paidAt,
      paidAmount: p.paidAmount,
    }));
  }

  /**
   * The oldest instalment still owing something — by SEQUENCE, not by date: undoing
   * allows paying out of order, so an earlier instalment can be unpaid while a later
   * one is settled.
   */
  private oldestOutstanding(): InstallmentPaymentProps | null {
    return (
      [...this.props.payments]
        .sort((a, b) => a.sequence - b.sequence)
        .find((p) => toMoney(outstandingOn(this.toCarryable(p))).greaterThan(0)) ?? null
    );
  }

  private toCarryable(p: InstallmentPaymentProps): CarryablePayment {
    return {
      sequence: p.sequence,
      amount: p.amount,
      carriedOverAmount: p.carriedOverAmount,
      paidAt: p.paidAt,
      paidAmount: p.paidAmount,
    };
  }

  /** Σ of what was really paid. A legacy row (paid, no amount) counts for what it was
   *  scheduled at: it WAS paid, and that is the only honest figure available. */
  private paidTotal(): string {
    return sumMoney(
      this.props.payments
        .filter((p) => p.paidAt !== null || p.paidAmount !== null)
        .map((p) => p.paidAmount ?? p.amount),
    );
  }

  toContract(context?: {
    now?: Date;
    cardKind?: accounts.CardKind | null;
    /** Why this plan's instalments cannot reach a statement (FR-009a/FR-023a), when
     * something blocks them. Resolved by the caller from the card's ACCOUNT. */
    billingWarning?: installments.PlanBillingWarning | null;
  }): installments.InstallmentPlan {
    const now = context?.now ?? new Date();
    const cardKind = context?.cardKind ?? null;
    const next = this.oldestOutstanding();
    // FR-023: the only case where "nothing is unpaid" is not the same as "finished"
    // — the last instalment took partial credit and had nowhere to carry the rest.
    const hasUnsettledShortfall = next !== null && next.paidAmount !== null && next.paidAt === null;

    return {
      id: this.props.id,
      title: this.props.title,
      totalPrincipal: moneyToString(this.props.totalPrincipal),
      installmentCount: this.props.installmentCount,
      startDate: this.props.startDate.toISOString(),
      currency: this.props.currency,
      frequency: this.props.frequency,
      frequencyInterval: this.props.frequencyInterval,
      cardId: this.props.cardId,
      category: this.props.category,
      paymentAccountId: this.props.paymentAccountId,
      notes: this.props.notes,
      payments: this.props.payments.map((p) => ({
        id: p.id,
        sequence: p.sequence,
        dueDate: p.dueDate.toISOString(),
        amount: moneyToString(p.amount),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        paidAmount: p.paidAmount === null ? null : moneyToString(p.paidAmount),
        carriedOverAmount: moneyToString(p.carriedOverAmount),
        dueAmount: owedBy(this.toCarryable(p)),
        transactionId: p.transactionId,
        creditStatementId: p.creditStatementId,
        status: installments.installmentStatus({
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          creditStatementId: p.creditStatementId,
        }),
      })),
      paidTotal: this.paidTotal(),
      remainingAmount: outstandingTotal(this.carryable()),
      nextDueDate: next ? next.dueDate.toISOString() : null,
      status: installments.planStatus(
        next ? next.dueDate.toISOString() : null,
        now,
        hasUnsettledShortfall,
      ),
      generatesMovementOnPay: installments.generatesMovementOnPay(cardKind),
      ...installments.planCounters(
        this.props.payments.map((p) => ({
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          creditStatementId: p.creditStatementId,
        })),
      ),
      // The caller (`toPlanDtos`) is the sole decider here — it depends on the
      // card's ACCOUNT (billing day, currency) and on whether a card was once
      // billed and later removed, none of which this aggregate loads or tracks.
      // Passed through as-is, including the CARD_REMOVED case, where `cardKind`
      // is already null (the card is gone) and would otherwise look identical to
      // a plan that never had one.
      billingWarning: context?.billingWarning ?? null,
      // Only the detail query fills it in (see `withDeletionImpact`): the list would
      // pay for a figure only the delete confirmation ever reads.
      deletionImpact: null,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}

function addPeriod(
  date: Date,
  n: number,
  freq: installments.InstallmentFrequency,
  interval: number,
): Date {
  const d = new Date(date);
  const step = n * interval;
  switch (freq) {
    case "DAILY":
      d.setDate(d.getDate() + step);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + step * 7);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      d.setMonth(d.getMonth() + step);
  }
  return d;
}
