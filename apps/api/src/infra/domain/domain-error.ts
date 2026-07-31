/**
 * Shared base for every domain's errors. Each table-domain (`domains/<table>/`)
 * owns its own `domain/errors.ts` with the specific codes it throws, but they
 * all extend this one class so `AllExceptionsFilter` has a single shape to map
 * (`code`/`httpStatus`/`field`) no matter which domain threw.
 *
 * Lives in `infra/` rather than in one domain because it is not a business rule
 * of any single table — it is the contract between the domain layers and the
 * HTTP layer (see the one-table-one-domain note in ARCHITECTURE.md §12a).
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
