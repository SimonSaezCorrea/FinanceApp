import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodValidationPipe } from "../../../../src/infra/http/zod-validation.pipe";
import { rowId } from "@finance/contracts";

describe("ZodValidationPipe", () => {
  it("maps a nested rowId body field's failure to INVALID_ID_FORMAT with its full path", () => {
    const pipe = new ZodValidationPipe(z.object({ bankAccountId: rowId, amount: z.string() }));
    try {
      pipe.transform({ bankAccountId: "nope", amount: "10.00" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toEqual({ code: "INVALID_ID_FORMAT", field: "bankAccountId" });
    }
  });

  it("still falls back to the generic code for a non-rowId field failure", () => {
    const pipe = new ZodValidationPipe(z.object({ amount: z.string().min(1) }));
    try {
      pipe.transform({ amount: "" });
      expect.unreachable();
    } catch (error) {
      const response = (error as BadRequestException).getResponse();
      expect(response).toEqual({ code: "VALIDATION_FAILED", field: "amount" });
    }
  });

  it("passes through a well-formed body unchanged", () => {
    const schema = z.object({ bankAccountId: rowId });
    const pipe = new ZodValidationPipe(schema);
    const value = "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f";
    expect(pipe.transform({ bankAccountId: value })).toEqual({ bankAccountId: value });
  });
});
