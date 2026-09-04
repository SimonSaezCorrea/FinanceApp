import { describe, expect, it } from "vitest";

import { generateRowId } from "../../../../src/infra/id/generate-row-id";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateRowId", () => {
  it("returns a canonical UUID v7 string", () => {
    expect(generateRowId()).toMatch(UUID_V7);
  });

  it("returns a different value on each call", () => {
    const a = generateRowId();
    const b = generateRowId();
    expect(a).not.toBe(b);
  });
});
