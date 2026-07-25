import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

import type { ApiError } from "@finance/contracts";

/**
 * Maps every error to the language-agnostic contract shape
 * `{ error: { code, field?, details? } }` (Clarify Q1 / FR-007a, SC-010).
 * Never returns localized prose — the frontend maps `code` → es/en text.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let field: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const thrown =
        typeof response === "object" && response !== null
          ? (response as { code?: unknown; field?: unknown })
          : undefined;
      if (typeof thrown?.code === "string") {
        code = thrown.code;
        if (typeof thrown.field === "string") field = thrown.field;
      } else {
        code = statusToCode(status);
      }
    } else if (isDomainError(exception)) {
      // Domain-layer errors (`domain/errors.ts` in each migrated domain) are
      // plain Errors, not `HttpException` — they carry their own httpStatus/code/
      // field (duck-typed here, not imported, so `infra` never depends on a
      // domain's classes) and must map identically to the pre-migration
      // `BadRequestException({code})`/`NotFoundException({code})` shape (FR-015).
      status = exception.httpStatus;
      code = exception.code;
      field = exception.field;
    }

    const body: ApiError = { error: { code, ...(field ? { field } : {}) } };
    res.status(status).json(body);
  }
}

function isDomainError(
  exception: unknown,
): exception is { httpStatus: number; code: string; field?: string } {
  return (
    exception instanceof Error &&
    typeof (exception as { httpStatus?: unknown }).httpStatus === "number" &&
    typeof (exception as { code?: unknown }).code === "string"
  );
}

function statusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "VALIDATION_FAILED";
    default:
      return "INTERNAL_ERROR";
  }
}
