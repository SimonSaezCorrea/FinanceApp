/**
 * Domain errors: thrown by the aggregate when an invariant is violated —
 * never a generic exception, never a duplicated check in a handler/controller
 * (FR-002). Presentation maps `code` to the identical HTTP status the
 * pre-migration `InstallmentsService` threw (FR-015).
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 400 | 404 | 409 = 400,
    public readonly field?: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class InstallmentPlanNotFoundError extends DomainError {
  constructor() {
    super("INSTALLMENT_PLAN_NOT_FOUND", 404);
  }
}

export class InstallmentPaymentNotFoundError extends DomainError {
  constructor() {
    super("INSTALLMENT_PAYMENT_NOT_FOUND", 404);
  }
}

/** Paying one that is already paid. This is what stops a double-click from
 *  recording two expenses for the same instalment (FR-025/INV-C3). */
export class InstallmentPaymentAlreadyPaidError extends DomainError {
  constructor() {
    super("INSTALLMENT_PAYMENT_ALREADY_PAID", 409);
  }
}

/** The plan records a real movement on payment, so it needs an account to pay from. */
export class InstallmentPaymentAccountRequiredError extends DomainError {
  constructor() {
    super("INSTALLMENT_PAYMENT_ACCOUNT_REQUIRED", 400, "fromAccountId");
  }
}

/** A payment account was supplied for a plan bought with a CREDIT card. That debt is
 *  already in the card's statement; recording it again counts it twice (FR-037). */
export class InstallmentCardIsCreditError extends DomainError {
  constructor() {
    super("INSTALLMENT_CARD_IS_CREDIT", 409, "fromAccountId");
  }
}

/** Zero or negative. Undoing is how a payment is annulled, not paying nothing. */
export class InvalidPaymentAmountError extends DomainError {
  constructor() {
    super("INVALID_PAYMENT_AMOUNT", 400, "amount");
  }
}

/** Account and plan are in different currencies and the amount actually charged to
 *  the account was not stated. This app has no exchange rate to guess it with. */
export class PaymentCurrencyAmbiguousError extends DomainError {
  constructor() {
    super("PAYMENT_CURRENCY_AMBIGUOUS", 400, "chargedAmount");
  }
}

/** More than the whole plan still owes. The surplus has no debt to apply to, and this
 *  domain has no notion of credit in the user's favour (FR-021b). */
export class PaymentExceedsRemainingError extends DomainError {
  constructor() {
    super("PAYMENT_EXCEEDS_REMAINING", 409, "amount");
  }
}

/** Paying an instalment from a credit-card account is settling debt with debt: no
 *  money leaves, and the credit pool would be distorted (FR-028b). */
export class InstallmentPaymentFromCreditAccountError extends DomainError {
  constructor() {
    super("INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT", 409, "fromAccountId");
  }
}
