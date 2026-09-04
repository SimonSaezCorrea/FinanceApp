import { describe, expect, it } from "vitest";

import { rowId } from "./row-id";

const V7 = "018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f";
const V4 = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("rowId", () => {
  it("accepts a well-formed UUID v7", () => {
    expect(rowId.safeParse(V7).success).toBe(true);
  });

  it("rejects a well-formed UUID of a different version (v4)", () => {
    expect(rowId.safeParse(V4).success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(rowId.safeParse("").success).toBe(false);
  });

  it("rejects an obviously malformed string", () => {
    expect(rowId.safeParse("not-a-real-id").success).toBe(false);
  });

  it("carries the INVALID_ID_FORMAT error code as meta", () => {
    expect(rowId.meta()).toEqual({ errorCode: "INVALID_ID_FORMAT" });
  });
});
