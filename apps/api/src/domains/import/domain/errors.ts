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
