import { accounts } from "@finance/contracts";
import { addMoney, moneyToString, toMoney } from "@finance/money";

import { AccountDeactivatedEvent } from "./events/account-deactivated.event";
import {
  AccountCannotHaveCardError,
  AccountNumberRequiredError,
  AccountTypeChangeNotAllowedError,
  CardKindNotAllowedError,
  CardLimitRequiredError,
  CardNotFoundError,
  CardSubLimitExceedsAccountError,
  CreditPoolCurrencyNotFoundError,
  CreditPoolInUseError,
  CreditSettingsNotAllowedError,
  PrimaryCardInvalidReplacementError,
  PrimaryCardReplacementRequiredError,
  InvalidAccountAliasError,
  InvalidAccountNumberError,
  OverdraftNotAllowedError,
  InvalidInitialBalanceError,
} from "./errors";

export interface CardLimitProps {
  id: string;
  currency: string;
  limitAmount: string;
  usedInitial: string;
}

/** The account's credit in a currency OTHER than its own (spec 039, table
 * `account-credit-limit`). Its usage is derived from movements, never stored. */
export interface ExtraCreditLimitProps {
  id: string;
  currency: string;
  limitAmount: string;
  usedInitial: string;
}

type ExtraCreditLimitInput = { currency: string; limitAmount: string; usedInitial?: string };

export interface CardProps {
  id: string;
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive: boolean;
  isPrimary: boolean;
  /** No plastic: several virtual cards can share one account. */
  isVirtual: boolean;
  /** Issued to another person against the same account/credit line. */
  isAdditional: boolean;
  /** Name on the card, when it isn't the account owner's. */
  cardholderName: string | null;
  network: accounts.CardNetwork | null;
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
  /** Transfer alias, where the market has one (Argentina). */
  accountAlias: string | null;
  initialBalance: string;
  currentBalance: string;
  /** How far below zero this account may go ("0" = no overdraft line). */
  overdraftLimit: string;
  /** The most it may hold (null = no ceiling declared). */
  balanceCeiling: string | null;
  creditLimit: string;
  creditUsedInitial: string;
  creditUsed: string;
  billingCycleDay: number | null;
  billingCycleType: accounts.BillingCycleType;
  paymentMethod: accounts.BillingPaymentMethod;
  /** Meaning depends on `paymentDueCycleType`: business days after close, or a
   * day-of-month. Null = unconfigured. */
  paymentDueDay: number | null;
  paymentDueCycleType: accounts.BillingCycleType;
  /** Minimum-payment percentage of this account's statements ("5" = 5%), or null. */
  minimumPaymentPercent: string | null;
  /** Credit in other currencies (spec 039). Every card spends from it; the primary uses 100%. */
  extraCreditLimits?: ExtraCreditLimitProps[];
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
  isVirtual?: boolean;
  isAdditional?: boolean;
  cardholderName?: string | null;
  network?: accounts.CardNetwork | null;
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
  /** Primary only: limits sent in OTHER currencies, which are the ACCOUNT's credit in
   * those currencies (spec 039) — merged into it, never stored on the card. */
  accountExtraCreditLimits?: ExtraCreditLimitInput[];
}

/**
 * `BankAccount` aggregate: the authoritative object for a bank account and
 * every CREDIT-kind card it carries. Invariants ported over unchanged from
 * `AccountsService`/`CardsService` (same rules, now enforced here):
 *  - A card's kind must belong on the account's type (`ALLOWED_CARD_KINDS`):
 *    SAVINGS/INVESTMENT/CASH carry none at all, a PREPAID account carries only
 *    prepaid cards, and no other type carries a prepaid one.
 *  - `accountNumber` required for CHECKING/SIGHT/SAVINGS/PREPAID.
 *  - A PREPAID account never starts with a negative balance, and its type can
 *    never be converted to or from another one.
 *  - Every CREDIT card resolves to a determinate limit (primary mirrors the
 *    account pool; additional cards share it or carry their own sub-limit,
 *    capped against the account pool in the account's own currency).
 */
export class BankAccount {
  private constructor(private props: BankAccountProps) {}

  static fromPersistence(props: BankAccountProps): BankAccount {
    return new BankAccount({
      ...props,
      extraCreditLimits: [...(props.extraCreditLimits ?? [])],
      // The primary has no sub-limits (spec 039). Rows in another currency left on it by data
      // older than the migration are the account's credit now, read from `extraCreditLimits`.
      cards: props.cards.map((c) => ({ ...c, limits: c.isPrimary ? [] : [...c.limits] })),
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
    initialBalance?: string;
    overdraftLimit?: string;
    creditLimit?: string;
    creditUsedInitial?: string;
    extraCreditLimits?: ExtraCreditLimitInput[];
    cards?: CardInput[];
  }): {
    creditLimit: string;
    creditUsedInitial: string;
    extraCreditLimits: Omit<ExtraCreditLimitProps, "id">[];
    cards: (ResolvedCardPlacement & CardInput)[];
  } {
    BankAccount.assertInitialBalance(input.type, input.initialBalance);
    for (const card of input.cards ?? []) {
      BankAccount.assertCardKindAllowedFor(input.type, card.kind);
    }
    let creditLimit = input.creditLimit ?? "0";
    let creditUsedInitial = input.creditUsedInitial ?? "0";
    const extras = new Map<string, Omit<ExtraCreditLimitProps, "id">>();
    for (const l of input.extraCreditLimits ?? []) {
      extras.set(l.currency, BankAccount.extraLine(input.currency, l));
    }
    let primaryAssigned = false;
    // The primary first: an additional card's sub-limits are checked against the credit it sets.
    const resolved = (input.cards ?? []).map((c): (ResolvedCardPlacement & CardInput) | null => {
      if (c.kind !== "CREDIT") return { ...c, isPrimary: false, cardLimits: [] };
      if (primaryAssigned) return null;
      primaryAssigned = true;
      const own = (c.limits ?? []).find((l) => l.currency === input.currency);
      if (own && toMoney(own.limitAmount).greaterThan(0)) {
        creditLimit = own.limitAmount;
        creditUsedInitial = own.usedInitial ?? "0";
      } else if (!toMoney(creditLimit).greaterThan(0)) {
        throw new CardLimitRequiredError();
      }
      // A limit sent for the primary in another currency is the account's credit there
      // (spec 039, and what clients older than it send); an explicit account line wins.
      for (const l of c.limits ?? []) {
        if (l.currency !== input.currency && !extras.has(l.currency)) {
          extras.set(l.currency, BankAccount.extraLine(input.currency, l));
        }
      }
      return { ...c, isPrimary: true, cardLimits: [] };
    });
    const lineIn = (currency: string): string | null =>
      currency === input.currency ? creditLimit : (extras.get(currency)?.limitAmount ?? null);
    const cards = (input.cards ?? []).map((c, i) => {
      const done = resolved[i];
      if (done) return done;
      if (c.usesAccountPool === false) {
        if (!c.limits || c.limits.length === 0) throw new CardLimitRequiredError();
        return { ...c, isPrimary: false, cardLimits: BankAccount.subLimits(c.limits, lineIn) };
      }
      return { ...c, isPrimary: false, cardLimits: [] };
    });
    return { creditLimit, creditUsedInitial, extraCreditLimits: [...extras.values()], cards };
  }

  toPersistenceState(): BankAccountProps {
    return {
      ...this.props,
      extraCreditLimits: [...this.lines],
      cards: this.props.cards.map((c) => ({ ...c, limits: [...c.limits] })),
    };
  }

  /** A credit line in another currency: never the account's own, always a positive limit. */
  private static extraLine(
    accountCurrency: string,
    l: ExtraCreditLimitInput,
  ): Omit<ExtraCreditLimitProps, "id"> {
    if (l.currency === accountCurrency || !toMoney(l.limitAmount).greaterThan(0)) {
      throw new CreditPoolCurrencyNotFoundError();
    }
    return { currency: l.currency, limitAmount: l.limitAmount, usedInitial: l.usedInitial ?? "0" };
  }

  /** An additional card's sub-limits (spec 039): each one in a currency the account has credit
   * in, positive, and never above that credit. */
  private static subLimits(
    limits: ExtraCreditLimitInput[],
    lineIn: (currency: string) => string | null,
  ): CardLimitProps[] {
    return limits.map((l) => {
      const line = lineIn(l.currency);
      if (line === null) throw new CreditPoolCurrencyNotFoundError();
      if (!toMoney(l.limitAmount).greaterThan(0)) throw new CardLimitRequiredError();
      if (toMoney(l.limitAmount).greaterThan(toMoney(line))) {
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
  get billingCycleType(): accounts.BillingCycleType {
    return this.props.billingCycleType;
  }
  get paymentMethod(): accounts.BillingPaymentMethod {
    return this.props.paymentMethod;
  }
  get paymentDueDay(): number | null {
    return this.props.paymentDueDay;
  }
  get paymentDueCycleType(): accounts.BillingCycleType {
    return this.props.paymentDueCycleType;
  }

  get minimumPaymentPercent(): string | null {
    return this.props.minimumPaymentPercent;
  }
  get cards(): readonly CardProps[] {
    return this.props.cards;
  }
  get extraCreditLimits(): readonly ExtraCreditLimitProps[] {
    return this.lines;
  }

  private get lines(): ExtraCreditLimitProps[] {
    return this.props.extraCreditLimits ?? [];
  }

  /** The account's credit limit in a currency — its own (`creditLimit`) or a line in another
   * one — or null when it has no credit there. */
  creditLineIn(currency: string): string | null {
    if (currency === this.props.currency) return this.props.creditLimit;
    return this.lines.find((l) => l.currency === currency)?.limitAmount ?? null;
  }
  get currentBalance(): string {
    return moneyToString(this.props.currentBalance);
  }
  get initialBalance(): string {
    return moneyToString(this.props.initialBalance);
  }

  /** Shared/master credit pool exists for a standalone CREDIT_CARD account OR
   * any other cardable account that's grown a CREDIT-kind card. */
  get hasCreditPool(): boolean {
    return this.props.type === "CREDIT_CARD" || this.props.cards.some((c) => c.kind === "CREDIT");
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

  /** The card kind must belong on this account type (`ALLOWED_CARD_KINDS`). Two
   * distinct refusals: an account that takes NO cards at all answers
   * ACCOUNT_CANNOT_HAVE_CARD, one that takes cards but not THIS kind answers
   * CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT. */
  assertCardKindAllowed(kind: accounts.CardKind): void {
    BankAccount.assertCardKindAllowedFor(this.props.type, kind);
  }

  private static assertCardKindAllowedFor(
    type: accounts.AccountType,
    kind: accounts.CardKind,
  ): void {
    if (!accounts.isCardableAccountType(type)) throw new AccountCannotHaveCardError();
    if (!accounts.isCardKindAllowed(type, kind)) throw new CardKindNotAllowedError();
  }

  /** A prepaid account holds provisioned funds, so it can't be registered already
   * owing money. Other types may legitimately start negative (an overdrawn
   * checking account). */
  private static assertInitialBalance(
    type: accounts.AccountType,
    initialBalance: string | undefined,
  ): void {
    if (type !== "PREPAID" || initialBalance === undefined) return;
    if (toMoney(initialBalance).isNegative()) throw new InvalidInitialBalanceError();
  }

  /**
   * The account's identifiers must be usable in the market they belong to. The
   * FORMAT is data about the country (`@finance/contracts`'s `account-number`),
   * applied permissively: a country whose format the app doesn't know accepts any
   * number. The alias, when sent at all, must be a usable one.
   *
   * `countryAlpha2` is null for an account with no institution (cash, or a manual
   * one) — nothing to check against, so nothing is refused.
   */
  static assertAccountIdentifiers(input: {
    countryAlpha2: string | null;
    accountNumber?: string | null;
    accountAlias?: string | null;
  }): void {
    const { countryAlpha2, accountNumber, accountAlias } = input;
    if (accountNumber?.trim() && !accounts.isValidAccountNumber(accountNumber, countryAlpha2)) {
      throw new InvalidAccountNumberError();
    }
    if (accountAlias?.trim() && !accounts.isValidAccountAlias(accountAlias)) {
      throw new InvalidAccountAliasError();
    }
  }

  /** An overdraft is the floor of a CASH balance, so only the account types that
   * hold spendable cash can be granted one, and it is never negative. */
  private static assertOverdraft(type: accounts.AccountType, overdraftLimit?: string): void {
    if (overdraftLimit === undefined || !isNonZero(overdraftLimit)) return;
    if (!accounts.allowsOverdraft(type) || toMoney(overdraftLimit).isNegative()) {
      throw new OverdraftNotAllowedError();
    }
  }

  /** Only a credit line carries a credit pool and billing settings: a checking
   * account's cash and a credit card's revolving debt are separate products, so
   * the pool belongs to the CREDIT_CARD account the card lives on. Zero/absent
   * figures are not "settings" — they're what every other account already has. */
  private static assertCreditSettings(
    type: accounts.AccountType,
    patch: {
      creditLimit?: string;
      creditUsedInitial?: string;
      billingCycleDay?: number | null;
      paymentDueDay?: number | null;
      minimumPaymentPercent?: string | null;
    },
  ): void {
    if (type === "CREDIT_CARD") return;
    const configured =
      isNonZero(patch.creditLimit) ||
      isNonZero(patch.creditUsedInitial) ||
      patch.billingCycleDay != null ||
      patch.paymentDueDay != null ||
      patch.minimumPaymentPercent != null;
    if (configured) throw new CreditSettingsNotAllowedError();
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
    accountAlias?: string | null;
    initialBalance?: string;
    overdraftLimit?: string;
    balanceCeiling?: string | null;
    creditLimit?: string;
    creditUsedInitial?: string;
    billingCycleDay?: number | null;
    billingCycleType?: accounts.BillingCycleType;
    paymentMethod?: accounts.BillingPaymentMethod;
    paymentDueDay?: number | null;
    paymentDueCycleType?: accounts.BillingCycleType;
    minimumPaymentPercent?: string | null;
  }): void {
    const effectiveType = patch.type ?? this.props.type;
    const effectiveAccountNumber = patch.accountNumber ?? this.props.accountNumber;
    // A prepaid account is a different product, not a setting: converting either
    // way would drag cards that can't exist on the other side, a credit pool and
    // billing periods with it.
    const changesType = effectiveType !== this.props.type;
    if (changesType && (effectiveType === "PREPAID" || this.props.type === "PREPAID")) {
      throw new AccountTypeChangeNotAllowedError();
    }
    // Changing the type must not strand the cards already issued on the account
    // (a credit card on a checking account is exactly what the matrix forbids).
    if (changesType) {
      for (const card of this.props.cards) {
        BankAccount.assertCardKindAllowedFor(effectiveType, card.kind);
      }
    }
    BankAccount.assertInitialBalance(effectiveType, patch.initialBalance);
    BankAccount.assertOverdraft(effectiveType, patch.overdraftLimit);
    BankAccount.assertCreditSettings(effectiveType, patch);
    this.assertAccountNumber(effectiveType, effectiveAccountNumber);
    if (patch.creditLimit !== undefined) {
      this.assertLineCoversSubLimits(this.props.currency, patch.creditLimit);
    }
    if (patch.name !== undefined) this.props.name = patch.name;
    if (patch.type !== undefined) this.props.type = patch.type;
    if (patch.status !== undefined) this.setStatus(patch.status);
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.institution !== undefined) this.props.institution = patch.institution;
    if (patch.institutionId !== undefined) this.props.institutionId = patch.institutionId;
    if (patch.accountNumber !== undefined) this.props.accountNumber = patch.accountNumber;
    if (patch.accountAlias !== undefined) this.props.accountAlias = patch.accountAlias;
    if (patch.initialBalance !== undefined) this.props.initialBalance = patch.initialBalance;
    if (patch.overdraftLimit !== undefined) this.props.overdraftLimit = patch.overdraftLimit;
    if (patch.balanceCeiling !== undefined) this.props.balanceCeiling = patch.balanceCeiling;
    if (patch.creditLimit !== undefined) this.props.creditLimit = patch.creditLimit;
    if (patch.creditUsedInitial !== undefined)
      this.props.creditUsedInitial = patch.creditUsedInitial;
    if (patch.billingCycleDay !== undefined) this.props.billingCycleDay = patch.billingCycleDay;
    if (patch.billingCycleType !== undefined) this.props.billingCycleType = patch.billingCycleType;
    if (patch.paymentMethod !== undefined) this.props.paymentMethod = patch.paymentMethod;
    if (patch.paymentDueDay !== undefined) this.props.paymentDueDay = patch.paymentDueDay;
    if (patch.paymentDueCycleType !== undefined)
      this.props.paymentDueCycleType = patch.paymentDueCycleType;
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

  /** An additional card's sub-limits can't promise more than the account's credit in their
   * currency, nor exist where the account has none (spec 039). */
  private normalizeLimits(limits: ExtraCreditLimitInput[]): CardLimitProps[] {
    return BankAccount.subLimits(limits, (currency) => this.creditLineIn(currency));
  }

  /** Lowering the account's credit in a currency below an additional card's sub-limit there
   * would leave that sub-limit promising credit the account doesn't have. */
  private assertLineCoversSubLimits(currency: string, limitAmount: string): void {
    const exceeded = this.props.cards.some(
      (c) =>
        !c.isPrimary &&
        c.limits.some(
          (l) =>
            l.currency === currency && toMoney(l.limitAmount).greaterThan(toMoney(limitAmount)),
        ),
    );
    if (exceeded) throw new CardSubLimitExceedsAccountError();
  }

  /**
   * Replaces the account's credit in other currencies (spec 039, `PATCH /accounts/:id` with
   * `extraCreditLimits`). Only a credit card account has any; each line is another currency,
   * once, positive, and covers every additional card's sub-limit there. Removing a line that
   * still has sub-limits is refused here; the handler refuses one that still owes something
   * (usage and unsettled statements live in other tables).
   */
  setExtraCreditLimits(lines: ExtraCreditLimitInput[]): void {
    if (lines.length > 0 && this.props.type !== "CREDIT_CARD") {
      throw new CreditSettingsNotAllowedError();
    }
    const next: ExtraCreditLimitProps[] = [];
    for (const l of lines) {
      if (next.some((n) => n.currency === l.currency)) throw new CreditPoolCurrencyNotFoundError();
      const line = BankAccount.extraLine(this.props.currency, l);
      this.assertLineCoversSubLimits(l.currency, line.limitAmount);
      const existing = this.lines.find((e) => e.currency === l.currency);
      next.push({ id: existing?.id ?? "", ...line });
    }
    const removedWithSubLimits = this.removedCreditCurrencies(lines).some((currency) =>
      this.props.cards.some((c) => !c.isPrimary && c.limits.some((l) => l.currency === currency)),
    );
    if (removedWithSubLimits) throw new CreditPoolInUseError();
    this.props.extraCreditLimits = next;
  }

  /** Lines a client sent through the primary card (spec 039 compatibility): each one sets the
   * account's credit in that currency; nothing is removed this way. */
  mergeExtraCreditLimits(lines: ExtraCreditLimitInput[]): void {
    if (lines.length === 0) return;
    const merged = new Map(this.lines.map((e) => [e.currency, { ...e }]));
    for (const l of lines) {
      const line = BankAccount.extraLine(this.props.currency, l);
      this.assertLineCoversSubLimits(l.currency, line.limitAmount);
      merged.set(l.currency, { id: merged.get(l.currency)?.id ?? "", ...line });
    }
    this.props.extraCreditLimits = [...merged.values()];
  }

  /** Currencies whose line `setExtraCreditLimits(lines)` would remove — what the handler
   * checks for usage and unsettled statements before applying it. */
  removedCreditCurrencies(lines: { currency: string }[]): string[] {
    return this.lines
      .filter((e) => !lines.some((l) => l.currency === e.currency))
      .map((e) => e.currency);
  }

  /**
   * Makes `newPrimaryId` the account's primary card (spec 039): an ACTIVE CREDIT card of this
   * account. Neither the account's credit nor any line moves — the primary just uses 100% of
   * it; both cards end without sub-limits (the new primary can't have any, and the previous one
   * becomes an additional card sharing the credit). A no-op when it already is the primary.
   */
  changePrimary(newPrimaryId: string): void {
    const target = this.props.cards.find((c) => c.id === newPrimaryId);
    if (!target || target.kind !== "CREDIT" || !target.isActive) {
      throw new PrimaryCardInvalidReplacementError();
    }
    if (target.isPrimary) return;
    for (const c of this.props.cards) {
      if (c.isPrimary) {
        c.isPrimary = false;
        c.limits = [];
      }
    }
    target.isPrimary = true;
    target.limits = [];
  }

  /** A card created inside the same transaction as the swap (`replace-primary` with a new
   * card), so `changePrimary` can name it. */
  attachCard(card: CardProps): void {
    this.props.cards.push({ ...card, limits: [...card.limits] });
  }

  /** Marks a card inactive (the source of `replace-primary DEACTIVATE`, once it is no longer
   * the primary). */
  deactivateCard(cardId: string): void {
    const card = this.findCardOrThrow(cardId);
    if (card.isPrimary) throw new PrimaryCardReplacementRequiredError();
    card.isActive = false;
  }

  /** Drops a card (the source of `replace-primary DELETE`, once it is no longer the primary). */
  detachCard(cardId: string): void {
    const card = this.findCardOrThrow(cardId);
    if (card.isPrimary) throw new PrimaryCardReplacementRequiredError();
    this.props.cards = this.props.cards.filter((c) => c.id !== cardId);
  }

  /** Deactivating the ACTIVE primary through a plain edit is refused: it goes through
   * `replace-primary`, which names the card that takes its place. A primary already inactive
   * (data from before spec 039) may still be edited, so it can be repaired. */
  assertCardUpdateKeepsPrimary(cardId: string, isActive: boolean | undefined): void {
    const card = this.findCardOrThrow(cardId);
    if (card.isPrimary && card.isActive && isActive === false) {
      throw new PrimaryCardReplacementRequiredError();
    }
  }

  /** Deleting the primary through a plain delete is refused (see `replace-primary`). */
  assertCardRemovable(cardId: string): void {
    if (this.findCardOrThrow(cardId).isPrimary) throw new PrimaryCardReplacementRequiredError();
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
    this.assertCardKindAllowed(input.kind);
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
      const hasOwn = !!own && toMoney(own.limitAmount).greaterThan(0);
      // The primary uses the account's credit: a first credit card on an account that already
      // has a credit limit needn't repeat it (spec 039).
      if (!hasOwn && !toMoney(this.props.creditLimit).greaterThan(0)) {
        throw new CardLimitRequiredError();
      }
      return {
        isPrimary: true,
        cardLimits: [],
        accountCreditLimit: hasOwn ? own.limitAmount : this.props.creditLimit,
        accountCreditUsedInitial: hasOwn
          ? (own.usedInitial ?? fallbackUsedInitial)
          : this.props.creditUsedInitial,
        accountExtraCreditLimits: (input.limits ?? []).filter(
          (l) => l.currency !== this.props.currency,
        ),
      };
    }

    if (input.usesAccountPool !== false) {
      return {
        isPrimary: false,
        cardLimits: [],
      };
    }
    if (!input.limits || input.limits.length === 0) {
      throw new CardLimitRequiredError();
    }
    return {
      isPrimary: false,
      cardLimits: this.normalizeLimits(input.limits),
    };
  }

  findCardOrThrow(cardId: string): CardProps {
    const card = this.props.cards.find((c) => c.id === cardId);
    if (!card) throw new CardNotFoundError();
    return card;
  }
}

/** A money string that actually configures something (absent or 0 does not). */
function isNonZero(value: string | undefined): boolean {
  return value != null && !toMoney(value).isZero();
}
