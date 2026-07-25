/**
 * Domain errors: thrown when an invariant is violated — never a generic
 * exception, never a duplicated check in a handler/controller (FR-002).
 * Presentation maps `code` to the identical HTTP status the pre-migration
 * `WalletService` threw (FR-015): `NotFound` (404) via `NotFoundException`,
 * `Conflict` (409) via `ConflictException`.
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

/** XOR invariant violation: neither or both of accountId/cardId were given.
 * Defense-in-depth — `wallet.createWalletItemSchema`'s zod `refine` already
 * rejects this at the HTTP boundary, but the aggregate must not trust its
 * caller either (Constitution Principle II). */
export class WalletItemInvalidError extends DomainError {
  constructor() {
    super("WALLET_ITEM_INVALID", 400);
  }
}

export class WalletAccountNotFoundError extends DomainError {
  constructor() {
    super("ACCOUNT_NOT_FOUND", 404);
  }
}

export class WalletCardNotFoundError extends DomainError {
  constructor() {
    super("CARD_NOT_FOUND", 404);
  }
}

export class WalletItemExistsError extends DomainError {
  constructor() {
    super("WALLET_ITEM_EXISTS", 409);
  }
}

export class WalletItemNotFoundError extends DomainError {
  constructor() {
    super("WALLET_ITEM_NOT_FOUND", 404);
  }
}
