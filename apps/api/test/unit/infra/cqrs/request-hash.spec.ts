import { describe, expect, it } from "vitest";

import { requestHash } from "../../../../src/infra/cqrs/request-hash";

describe("requestHash", () => {
  it("is stable across key order — a retry serialized differently is still the same attempt", () => {
    const a = requestHash({ amount: "12000", type: "EXPENSE", currency: "CLP" });
    const b = requestHash({ currency: "CLP", type: "EXPENSE", amount: "12000" });
    expect(a).toBe(b);
  });

  it("sorts keys at every depth, not just the top level", () => {
    const a = requestHash({ outer: { z: 1, a: 2 } });
    const b = requestHash({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("keeps array order significant — [a, b] is not [b, a]", () => {
    expect(requestHash({ rows: [1, 2] })).not.toBe(requestHash({ rows: [2, 1] }));
  });

  it("changes when any value changes", () => {
    const a = requestHash({ amount: "12000" });
    const b = requestHash({ amount: "12001" });
    expect(a).not.toBe(b);
  });

  it("treats an absent key and an explicit undefined as the same payload", () => {
    // JSON.stringify drops undefined anyway; making it explicit so a client that
    // spreads an optional field is not told its data changed.
    expect(requestHash({ a: 1, b: undefined })).toBe(requestHash({ a: 1 }));
  });

  it("distinguishes null from absent — null is a value the user chose", () => {
    expect(requestHash({ a: 1, b: null })).not.toBe(requestHash({ a: 1 }));
  });

  it("handles a body-less request without throwing", () => {
    expect(requestHash(undefined)).toBe(requestHash(undefined));
    expect(typeof requestHash(undefined)).toBe("string");
  });
});
