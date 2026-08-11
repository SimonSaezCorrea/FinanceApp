import { accounts } from "@finance/contracts";
import { addMoney, moneyToString, toMoney } from "@finance/money";

import { AccountDeactivatedEvent } from "./events/account-deactivated.event";
import {
  AccountCannotHaveCardError,
  AccountNumberRequiredError,
  CardLimitRequiredError,
  CardNotFoundError,
  CardSubLimitExceedsAccountError,
} from "./errors";

export interface CardLimitProps {
  id: string;
  currency: string;
  limitAmount: string;
  usedInitial: string;
}

export interface CardProps {
  id: string;
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive: boolean;
  isPrimary: boolean;
  limits: CardLimitProps[];
}

export interface BankAccountProps {
  id: string;
  userId: string;
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  currency: string;
  institution: string | null;
  institutionId: string | null;
  institutionName: string | null;
  accountNumber: string | null;
  initialBalance: string;
  currentBalance: string;
  creditLimit: string;
  creditUsedInitial: string;
  creditUsed: string;
  billingCycleDay: number | null;
  paymentMethod: accounts.BillingPaymentMethod;
  /** Minimum-payment percentage of this account's statements ("5" = 5%), or null. */
  minimumPaymentPercent: string | null;
  cards: CardProps[];
  createdAt: Date;
  updatedAt: Date;
}

type CardInput = {
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive?: boolean;
  usesAccountPool?: boolean;
  limits?: { currency: string; limitAmount: string; usedInitial?: string }[];
};

/** What the aggregate resolves a (new or edited) CREDIT card's placement to —
 * used by the repository adapter to know exactly what to write. */
export interface ResolvedCardPlacement {
  isPrimary: boolean;
  cardLimits: CardLimitProps[];
  /** Set only when this card becomes/remains the primary — the account's own
   * creditLimit/creditUsedInitial mirror it 1:1. */
  accountCreditLimit?: string;
  accountCreditUsedInitial?: string;
}

/**
 * `BankAccount` aggregate: the authoritative object for a bank account and
 * every CREDIT-kind card it carries. Invariants ported over unchanged from
 * `AccountsService`/`CardsService` (same rules, now enforced here):
 *  - Only CHECKING/SIGHT/CREDIT_LINE accounts can carry a card.
 *  - `accountNumber` required for CHECKING/SIGHT/SAVINGS.
 *  - Every CREDIT card resolves to a determinate limit (primary mirrors the
 *    account pool; additional cards share it or carry their own sub-limit,
 *    capped against the account pool in the account's own currency).
 */
export class BankAccount {
  private constructor(private props: BankAccountProps) {}

  static fromPersistence(props: BankAccountProps): BankAccount {
    return new BankAccount({
      ...props,
      cards: props.cards.map((c) => ({ ...c, limits: [...c.limits] })),
    });
  }

  /**
   * Factory Method (FR-008, recommended for complex construction): plans a
   * brand-new account + its inline `cards[]` (no DB row exists yet, so "does a
   * primary already exist" is just "have we seen a CREDIT card earlier in
   * this same array" — the first one always becomes primary). Returns plain
   * data the infrastructure adapter inserts; ID assignment stays a
   * persistence concern (Prisma's `@default(cuid())`).
   */
  static planCreation(input: {
    type: accounts.AccountType;
    currency: string;
    creditLimit?: string;
    creditUsedInitial?: string;
    cards?: CardInput[];
  }): {
    creditLimit: string;
    creditUsedInitial: string;
    cards: (ResolvedCardPlacement & CardInput)[];
  } {
    if ((input.cards?.length ?? 0) > 0 && !accounts.isCardableAccountType(input.type)) {
      throw new AccountCannotHaveCardError();
    }
    let creditLimit = input.creditLimit ?? "0";
    let creditUsedInitial = input.creditUsedInitial ?? "0";
    let primaryAssigned = false;
    const cards = (input.cards ?? []).map((c) => {
      if (c.kind !== "CREDIT") {
        return { ...c, isPrimary: false, cardLimits: [] };
      }
      if (!primaryAssigned) {
        const own = (c.limits ?? []).find((l) => l.currency === input.currency);
        if (!own || !toMoney(own.limitAmount).greaterThan(0)) {
          throw new CardLimitRequiredError();
        }
        creditLimit = own.limitAmount;
        creditUsedInitial = own.usedInitial ?? "0";
        primaryAssigned = true;
        const extra = (c.limits ?? []).filter((l) => l.currency !== input.currency);
        const cardLimits = extra.map((l) => ({
          id: "",
          currency: l.currency,
          limitAmount: l.limitAmount,
          usedInitial: l.usedInitial ?? "0",
        }));
        return { ...c, isPrimary: true, cardLimits };
      }
      if (c.usesAccountPool === false) {
        if (!c.limits || c.limits.length === 0) throw new CardLimitRequiredError();
        const cardLimits = c.limits.map((l) => {
          if (
            l.currency === input.currency &&
            toMoney(l.limitAmount).greaterThan(toMoney(creditLimit))
          ) {
            throw new CardSubLimitExceedsAccountError();
          }
          return {
            id: "",
            currency: l.currency,
            limitAmount: l.limitAmount,
            usedInitial: l.usedInitial ?? "0",
          };
        });
        return { ...c, isPrimary: false, cardLimits };
      }
      return { ...c, isPrimary: false, cardLimits: [] };
    });
    return { creditLimit, creditUsedInitial, cards };
  }

  toPersistenceState(): BankAccountProps {
    return { ...this.props, cards: this.props.cards.map((c) => ({ ...c, limits: [...c.limits] })) };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get name(): string {
    return this.props.name;
  }
  get type(): accounts.AccountType {
    return this.props.type;
  }
  get status(): accounts.AccountStatus {
    return this.props.status;
  }
  get currency(): string {
    return this.props.currency;
  }
  get accountNumber(): string | null {
    return this.props.accountNumber;
  }
  get creditLimit(): string {
    return moneyToString(this.props.creditLimit);
  }
  get creditUsedInitial(): string {
    return moneyToString(this.props.creditUsedInitial);
  }
  get creditUsed(): string {
    return moneyToString(this.props.creditUsed);
  }
  get billingCycleDay(): number | null {
    return this.props.billingCycleDay;
  }
  get paymentMethod(): accounts.BillingPaymentMethod {
    return this.props.paymentMethod;
  }

  get minimumPaymentPercent(): string | null {
    return this.props.minimumPaymentPercent;
  }
  get cards(): readonly CardProps[] {
    return this.props.cards;
  }
  get currentBalance(): string {
    return moneyToString(this.props.currentBalance);
  }
  get initialBalance(): string {
    return moneyToString(this.props.initialBalance);
  }

  /** Shared/master credit pool exists for a standalone CREDIT_LINE account OR
   * any other cardable account that's grown a CREDIT-kind card. */
  get hasCreditPool(): boolean {
    return this.props.type === "CREDIT_LINE" || this.props.cards.some((c) => c.kind === "CREDIT");
  }

  get primaryCard(): CardProps | undefined {
    return this.props.cards.find((c) => c.kind === "CREDIT" && c.isPrimary);
  }

  /** Raw props for read-shaping (mapping to the API DTO) — the query layer's
   * job, not the aggregate's, but it needs the reconciled state to shape from. */
  snapshot(): Readonly<BankAccountProps> {
    return this.props;
  }

  /** ACCOUNT_NUMBER_REQUIRED — CHECKING/SIGHT/SAVINGS need a real accountNumber. */
  private assertAccountNumber(
    effectiveType: accounts.AccountType,
    effectiveAccountNumber: string | null | undefined,
  ) {
    if (accounts.isAccountNumberRequired(effectiveType) && !effectiveAccountNumber?.trim()) {
      throw new AccountNumberRequiredError();
    }
  }

  assertCardable(): void {
    if (!accounts.isCardableAccountType(this.props.type)) {
      throw new AccountCannotHaveCardError();
    }
  }

  /** Apply a partial update to the account's own scalar fields — validates the
   * ACCOUNT_NUMBER_REQUIRED invariant against the *effective* (patched) type. */
  applyUpdate(patch: {
    name?: string;
    type?: accounts.AccountType;
    status?: accounts.AccountStatus;
    currency?: string;
    institution?: string;
    institutionId?: string | null;
    accountNumber?: string;
    initialBalance?: string;
    creditLimit?: string;
    creditUsedInitial?: string;
    billingCycleDay?: number | null;
    paymentMethod?: accounts.BillingPaymentMethod;
    minimumPaymentPercent?: string | null;
  }): void {
    const effectiveType = patch.type ?? this.props.type;
    const effectiveAccountNumber = patch.accountNumber ?? this.props.accountNumber;
    this.assertAccountNumber(effectiveType, effectiveAccountNumber);
    if (patch.name !== undefined) this.props.name = patch.name;
    if (patch.type !== undefined) this.props.type = patch.type;
    if (patch.status !== undefined) this.setStatus(patch.status);
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.institution !== undefined) this.props.institution = patch.institution;
    if (patch.institutionId !== undefined) this.props.institutionId = patch.institutionId;
    if (patch.accountNumber !== undefined) this.props.accountNumber = patch.accountNumber;
    if (patch.initialBalance !== undefined) this.props.initialBalance = patch.initialBalance;
    if (patch.creditLimit !== undefined) this.props.creditLimit = patch.creditLimit;
    if (patch.creditUsedInitial !== undefined)
      this.props.creditUsedInitial = patch.creditUsedInitial;
    if (patch.billingCycleDay !== undefined) this.props.billingCycleDay = patch.billingCycleDay;
    if (patch.paymentMethod !== undefined) this.props.paymentMethod = patch.paymentMethod;
    if (patch.minimumPaymentPercent !== undefined)
      this.props.minimumPaymentPercent = patch.minimumPaymentPercent;
  }

  /** ACTIVE <-> INACTIVE. Emits `AccountDeactivatedEvent` only on a genuine
   * ACTIVE -> INACTIVE transition (idempotent no-op otherwise). */
  setStatus(status: accounts.AccountStatus): AccountDeactivatedEvent | null {
    const wasActive = this.props.status === "ACTIVE";
    this.props.status = status;
    if (wasActive && status === "INACTIVE") {
      return new AccountDeactivatedEvent(this.props.id);
    }
    return null;
  }


  /** Adjust the shared credit pool's usage (never below 0). */
  adjustCreditUsed(delta: string): void {
    const next = addMoney(this.props.creditUsed, delta);
    this.props.creditUsed = toMoney(next).isNegative() ? "0" : moneyToString(next);
  }

  /** A card's own sub-limit currency can't promise more than the account's
   * shared pool, in the account's own currency (CARD_SUBLIMIT_EXCEEDS_ACCOUNT). */
  private normalizeLimits(
    limits: { currency: string; limitAmount: string; usedInitial?: string }[],
  ): CardLimitProps[] {
    return limits.map((l) => {
      if (
        l.currency === this.props.currency &&
        toMoney(l.limitAmount).greaterThan(toMoney(this.props.creditLimit))
      ) {
        throw new CardSubLimitExceedsAccountError();
      }
      return {
        id: "", // assigned by the repository adapter on insert
        currency: l.currency,
        limitAmount: l.limitAmount,
        usedInitial: l.usedInitial ?? "0",
      };
    });
  }

  /**
   * Works out whether a CREDIT card is/becomes the account's PRIMARY (the
   * account's own creditLimit/creditUsedInitial mirror its limit 1:1), or an
   * additional card sharing the pool (no CardLimit rows) or carrying its own
   * sub-limit ("tope propio"). Non-CREDIT cards never have a pool concept.
   * `excludeCardId` excludes the card being edited from "does a primary
   * already exist" (so editing the current primary doesn't see itself as a
   * conflicting other primary).
   */
  resolveCardPlacement(input: CardInput, excludeCardId: string | null): ResolvedCardPlacement {
    if (input.kind !== "CREDIT") {
      return { isPrimary: false, cardLimits: [] };
    }

    const existingPrimary = this.props.cards.find(
      (c) => c.kind === "CREDIT" && c.isPrimary && c.id !== excludeCardId,
    );

    // Editing the account's own current primary and no usedInitial given:
    // preserve the account's existing seed instead of zeroing it (the UI never
    // surfaces this field, so omission means "unchanged").
    const isEditingCurrentPrimary = excludeCardId != null && !existingPrimary;
    const fallbackUsedInitial = isEditingCurrentPrimary ? this.props.creditUsedInitial : "0";

    if (!existingPrimary) {
      const own = (input.limits ?? []).find((l) => l.currency === this.props.currency);
      if (!own || !toMoney(own.limitAmount).greaterThan(0)) {
        throw new CardLimitRequiredError();
      }
      const extra = (input.limits ?? []).filter((l) => l.currency !== this.props.currency);
      return {
        isPrimary: true,
        cardLimits: this.normalizeLimits(extra),
        accountCreditLimit: own.limitAmount,
        accountCreditUsedInitial: own.usedInitial ?? fallbackUsedInitial,
      };
    }

    if (input.usesAccountPool !== false) {
      return { isPrimary: false, cardLimits: [] };
    }
    if (!input.limits || input.limits.length === 0) {
      throw new CardLimitRequiredError();
    }
    return { isPrimary: false, cardLimits: this.normalizeLimits(input.limits) };
  }

  findCardOrThrow(cardId: string): CardProps {
    const card = this.props.cards.find((c) => c.id === cardId);
    if (!card) throw new CardNotFoundError();
    return card;
  }
}
