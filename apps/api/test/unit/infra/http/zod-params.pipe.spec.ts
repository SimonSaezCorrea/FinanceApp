import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodParamsPipe } from "../../../../src/infra/http/zod-params.pipe";
import { rowId } from "@finance/contracts";

describe("ZodParamsPipe", () => {
  it("maps a rowId field's failure to INVALID_ID_FORMAT with the field name", () => {
    const pipe = new ZodParamsPipe(z.object({ id: rowId }));
    try {
      pipe.transform({ id: "not-a-real-id" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toEqual({ code: "INVALID_ID_FORMAT", field: "id" });
    }
  });

  it("rejects a well-formed UUID of the wrong version as INVALID_ID_FORMAT too", () => {
    const pipe = new ZodParamsPipe(z.object({ id: rowId }));
    try {
      pipe.transform({ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }); // v4
      expect.unreachable();
    } catch (error) {
      const response = (error as BadRequestException).getResponse();
      expect(response).toEqual({ code: "INVALID_ID_FORMAT", field: "id" });
    }
  });

  it("still falls back to the generic code for a non-rowId param failure", () => {
    const pipe = new ZodParamsPipe(z.object({ seq: z.coerce.number().int().positive() }));
    try {
      pipe.transform({ seq: "not-a-number" });
      expect.unreachable();
    } catch (error) {
      const response = (error as BadRequestException).getResponse();
      expect(response).toEqual({ code: "VALIDATION_FAILED", field: "seq" });
    }
  });

  it("passes through a well-formed value unchanged", () => {
    const pipe = new ZodParamsPipe(z.object({ id: rowId }));
    const value = "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f";
    expect(pipe.transform({ id: value })).toEqual({ id: value });
  });
});
