import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";

function makeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: "GET", originalUrl: "/api/v1/accounts" }),
    }),
  } as never;
  return { host, status, json };
}

/** Captures what the filter writes to the Nest logger for a 5xx. */
function captureLog(exception: unknown) {
  const { host, status, json } = makeHost();
  const filter = new AllExceptionsFilter();
  const error = vi
    .spyOn(
      (filter as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
      "error",
    )
    .mockImplementation(() => undefined);
  filter.catch(exception, host);
  const [message, stack] = error.mock.calls[0] ?? [];
  return { message: String(message ?? ""), stack, status, json };
}

/** A `PrismaClientKnownRequestError` as the filter sees it (duck-typed). */
function prismaError(code: string, message: string, meta?: Record<string, unknown>) {
  return Object.assign(new Error(message), { code, meta });
}

describe("AllExceptionsFilter", () => {
  it("preserves a domain-specific code thrown on the exception", () => {
    const { host, status, json } = makeHost();
    new AllExceptionsFilter().catch(
      new ConflictException({ code: "EMAIL_TAKEN", field: "email" }),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ error: { code: "EMAIL_TAKEN", field: "email" } });
  });

  it("falls back to a generic status-derived code when none was thrown", () => {
    const { host, status, json } = makeHost();
    new AllExceptionsFilter().catch(new NotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: { code: "NOT_FOUND" } });
  });

  it("preserves ACCOUNT_DISABLED / INVALID_CURRENT_PASSWORD (this feature's codes)", () => {
    const { host, json } = makeHost();
    new AllExceptionsFilter().catch(new UnauthorizedException({ code: "ACCOUNT_DISABLED" }), host);
    expect(json).toHaveBeenCalledWith({ error: { code: "ACCOUNT_DISABLED" } });
  });

  it("explains schema drift (P2022) instead of logging a bare code", () => {
    const { message, stack, status, json } = captureLog(
      prismaError("P2022", "The column `x` does not exist\n  in the current database.", {
        column: "bank-account.creditUsed",
      }),
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: { code: "INTERNAL_ERROR" } });
    expect(message).toContain("GET /api/v1/accounts");
    expect(message).toContain("bank-account.creditUsed");
    expect(message).toContain("pnpm db:push");
    // A named Prisma failure needs no stack — the frames are all Prisma internals.
    expect(stack).toBeUndefined();
  });

  it("keeps only the first line of an unmapped Prisma message", () => {
    const { message } = captureLog(
      prismaError("P2037", "Too many database connections opened\n\n  at Object.request (…)"),
    );
    expect(message).toContain("P2037: Too many database connections opened");
    expect(message).not.toContain("at Object.request");
  });

  it("keeps the stack for an error it cannot name", () => {
    const { message, stack } = captureLog(new TypeError("boom"));
    expect(message).toContain("TypeError: boom");
    expect(stack).toBeTypeOf("string");
  });

  it("stays silent for an expected 4xx", () => {
    const { message } = captureLog(new NotFoundException());
    expect(message).toBe("");
  });
});
