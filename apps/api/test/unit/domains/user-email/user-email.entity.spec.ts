import { describe, expect, it } from "vitest";

import {
  isConfirmable,
  isDeletable,
  normalizeEmailAddress,
  sortForDisplay,
  type UserEmailProps,
} from "../../../../src/domains/user-email/domain/user-email.entity";

function row(overrides: Partial<UserEmailProps>): UserEmailProps {
  return {
    id: "id",
    userId: "user",
    address: "a@x.cl",
    status: "PAST",
    verifiedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    replacedAt: null,
    ...overrides,
  };
}

describe("user-email rules", () => {
  it("normalizes an address by trimming and lower-casing it", () => {
    expect(normalizeEmailAddress("  Simon@MiFik.CL ")).toBe("simon@mifik.cl");
  });

  it("never lets the primary be deleted, and anything else can", () => {
    expect(isDeletable({ status: "PRIMARY" })).toBe(false);
    expect(isDeletable({ status: "PENDING" })).toBe(true);
    expect(isDeletable({ status: "PAST" })).toBe(true);
  });

  it("confirms a pending address or an unconfirmed primary, never history", () => {
    expect(isConfirmable({ status: "PENDING", verifiedAt: null })).toBe(true);
    expect(isConfirmable({ status: "PRIMARY", verifiedAt: null })).toBe(true);
    expect(isConfirmable({ status: "PRIMARY", verifiedAt: new Date() })).toBe(false);
    expect(isConfirmable({ status: "PAST", verifiedAt: null })).toBe(false);
  });

  it("lists the primary first, then the pending one, then history newest first", () => {
    const sorted = sortForDisplay([
      row({ id: "old", status: "PAST", replacedAt: new Date("2026-02-01T00:00:00Z") }),
      row({ id: "pending", status: "PENDING" }),
      row({ id: "recent", status: "PAST", replacedAt: new Date("2026-05-01T00:00:00Z") }),
      row({ id: "primary", status: "PRIMARY" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["primary", "pending", "recent", "old"]);
  });
});
