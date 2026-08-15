import { DomainError } from "../../../infra/domain/domain-error";

/**
 * Errors of the `bank-account` table's aggregate (which also guards its
 * `card-account`/`card-limit`/`billing-settings` children). The aggregate throws
 * these when an invariant is violated — never a generic exception, never a
 * duplicated check in a handler or controller (FR-002). `AllExceptionsFilter`
 * maps `code`/`httpStatus` to the same HTTP responses the API returned before
 * the migrations, so external behavior is unchanged (FR-015).
 */
export { DomainError };

export class AccountNotFoundError extends DomainError {
  constructor() {
    super("ACCOUNT_NOT_FOUND", 404);
  }
}

export class CardNotFoundError extends DomainError {
  constructor() {
    super("CARD_NOT_FOUND", 404);
  }
}

export class AccountNumberRequiredError extends DomainError {
  constructor() {
    super("ACCOUNT_NUMBER_REQUIRED", 400, "accountNumber");
  }
}

export class AccountCannotHaveCardError extends DomainError {
  constructor() {
    super("ACCOUNT_CANNOT_HAVE_CARD");
  }
}

export class CardLimitRequiredError extends DomainError {
  constructor() {
    super("CARD_LIMIT_REQUIRED");
  }
}

export class CardSubLimitExceedsAccountError extends DomainError {
  constructor() {
    super("CARD_SUBLIMIT_EXCEEDS_ACCOUNT");
  }
}

/** The card kind doesn't belong on this account type: a prepaid card only lives on
 * a prepaid account, a debit card only on a bank account, and a credit line carries
 * nothing but credit cards. Distinct from `ACCOUNT_CANNOT_HAVE_CARD`, which means
 * the account takes no cards at all. */
export class CardKindNotAllowedError extends DomainError {
  constructor() {
    super("CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT", 400, "kind");
  }
}

/** Converting an existing account to or from PREPAID. They are different financial
 * products, not two settings of one: a prepaid account has no credit line and its
 * cards can't exist anywhere else, so the conversion is refused rather than made to
 * drag cards, credit pool and billing periods with it. */
export class AccountTypeChangeNotAllowedError extends DomainError {
  constructor() {
    super("ACCOUNT_TYPE_CHANGE_NOT_ALLOWED", 400, "type");
  }
}

/** A negative starting balance on a prepaid account — it holds money, not credit. */
export class InvalidInitialBalanceError extends DomainError {
  constructor() {
    super("INVALID_INITIAL_BALANCE", 400, "initialBalance");
  }
}

/** A credit pool (or its billing settings) on an account that isn't a credit line.
 * Cash and revolving debt are separate products: the debt belongs to the
 * `CREDIT_CARD` account the card lives on, never to the checking account that
 * eventually pays its statement. */
export class CreditSettingsNotAllowedError extends DomainError {
  constructor() {
    super("CREDIT_SETTINGS_NOT_ALLOWED", 400, "creditLimit");
  }
}

/** An overdraft line on an account type that holds no spendable cash (or a
 * negative one). The overdraft is the floor of a balance, not a product. */
export class OverdraftNotAllowedError extends DomainError {
  constructor() {
    super("OVERDRAFT_NOT_ALLOWED", 400, "overdraftLimit");
  }
}

/** The account number doesn't match the format its country uses (today: a 22-digit
 * CBU/CVU with two check digits, in Argentina). Countries whose format the app
 * doesn't know accept anything — this only fires where there IS a rule. */
export class InvalidAccountNumberError extends DomainError {
  constructor() {
    super("INVALID_ACCOUNT_NUMBER", 400, "accountNumber");
  }
}

/** The transfer alias isn't a usable one (6-20 chars, letters/digits and `.-_`). */
export class InvalidAccountAliasError extends DomainError {
  constructor() {
    super("INVALID_ACCOUNT_ALIAS", 400, "accountAlias");
  }
}
