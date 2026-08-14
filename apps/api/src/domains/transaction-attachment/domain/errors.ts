/** Domain errors of the `transaction-attachment` table. */
export class AttachmentDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 400 | 404 | 503 = 400,
    public readonly field?: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class AttachmentTypeNotAllowedError extends AttachmentDomainError {
  constructor() {
    super("ATTACHMENT_TYPE_NOT_ALLOWED", 400, "file");
  }
}

export class AttachmentTooLargeError extends AttachmentDomainError {
  constructor() {
    super("ATTACHMENT_TOO_LARGE", 400, "file");
  }
}

/** No bucket/credentials configured — the feature is inert, not broken (FR-024). */
export class AttachmentsUnavailableError extends AttachmentDomainError {
  constructor() {
    super("ATTACHMENTS_UNAVAILABLE", 503);
  }
}

export class AttachmentNotFoundError extends AttachmentDomainError {
  constructor() {
    super("ATTACHMENT_NOT_FOUND", 404);
  }
}

/** 404, never 403: the API doesn't confirm that someone else's data exists. */
export class AttachmentTransactionNotFoundError extends AttachmentDomainError {
  constructor() {
    super("TRANSACTION_NOT_FOUND", 404);
  }
}
