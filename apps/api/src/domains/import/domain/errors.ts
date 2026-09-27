/**
 * Domain errors for the `import` flow — thrown when an import can't be applied,
 * never a generic exception.
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

/**
 * A row broke a movement rule (a prepaid balance going negative, a credit limit
 * exceeded, …). Keeps the rule's OWN code — the web already has a message for
 * each — and points `field` at the row (`rows.<index>`, zero-based), so the user
 * can be told which line of their file to fix. The whole import is refused.
 */
export class ImportRowRejectedError extends DomainError {
  static from(error: unknown, index: number): ImportRowRejectedError | unknown {
    if (
      error instanceof Error &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { httpStatus?: unknown }).httpStatus === "number"
    ) {
      const { code, httpStatus } = error as unknown as {
        code: string;
        httpStatus: 400 | 404 | 409;
      };
      return new ImportRowRejectedError(code, httpStatus, `rows.${index}`);
    }
    // Not a domain rule: a real bug, surfaced as-is.
    return error;
  }
}

/**
 * A template row (specs/027) broke a rule. Same idea as `ImportRowRejectedError`,
 * but pointing at a SHEET and an Excel row: `field` is `"<sheet>.<row>"`, e.g.
 * `"movements.12"`, which the web maps back to "Movimientos · fila 12". The rule's
 * own code is kept — the web already has a message for each.
 */
export class TemplateRowRejectedError extends DomainError {
  constructor(
    code: string,
    httpStatus: 400 | 404 | 409,
    public readonly sheet: string,
    public readonly row: number,
  ) {
    super(code, httpStatus, `${sheet}.${row}`);
  }
}

/** Codes the template import raises on its own (the rest are reused rules). */
export const TEMPLATE_CODES = {
  ACCOUNT_INACTIVE: "IMPORT_ACCOUNT_INACTIVE",
  CURRENCY_MISMATCH: "IMPORT_CURRENCY_MISMATCH",
  DUPLICATE_REF: "IMPORT_DUPLICATE_REF",
  UNKNOWN_REF: "IMPORT_UNKNOWN_REF",
  TOO_MANY_PAYMENTS: "IMPORT_TOO_MANY_PAYMENTS",
  INVALID_SEQUENCE: "IMPORT_INVALID_SEQUENCE",
  PAYMENT_BEFORE_START: "IMPORT_PAYMENT_BEFORE_START",
  PAYMENT_AMOUNT_MISMATCH: "IMPORT_PAYMENT_AMOUNT_MISMATCH",
  PLAN_PAYMENT_FIELDS: "IMPORT_PLAN_PAYMENT_FIELDS",
} as const;
