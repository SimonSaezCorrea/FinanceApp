import { DomainError } from "../../../infra/domain/domain-error";

/** Errors of the `exchange-rate` table-domain. */
export { DomainError };

/** A range wider than `EXCHANGE_RANGE_MAX_DAYS` — one query must stay bounded. */
export class ExchangeRangeTooLargeError extends DomainError {
  constructor() {
    super("EXCHANGE_RANGE_TOO_LARGE");
  }
}

/** `from` is after `to`. */
export class InvalidDateRangeError extends DomainError {
  constructor() {
    super("INVALID_DATE_RANGE");
  }
}
