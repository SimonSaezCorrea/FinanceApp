import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";

function makeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as never;
  return { host, status, json };
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
});
