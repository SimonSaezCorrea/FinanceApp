import { describe, expect, it } from "vitest";

import {
  requestEmailChangeSchema,
  resetPasswordRequestSchema,
  updateProfileRequestSchema,
  userEmailSchema,
  verifyEmailRequestSchema,
} from "./index";

describe("account email contracts (specs/032)", () => {
  it("accepts any non-empty token so the server answers the same for every bad link", () => {
    expect(verifyEmailRequestSchema.safeParse({ token: "anything" }).success).toBe(true);
    expect(verifyEmailRequestSchema.safeParse({ token: "" }).success).toBe(false);
  });

  it("applies the registration password rules to a reset", () => {
    expect(resetPasswordRequestSchema.safeParse({ token: "t", newPassword: "short" }).success).toBe(
      false,
    );
    expect(
      resetPasswordRequestSchema.safeParse({ token: "t", newPassword: "long enough" }).success,
    ).toBe(true);
  });

  it("requires a valid address to request an email change", () => {
    expect(requestEmailChangeSchema.safeParse({ address: "not-an-email" }).success).toBe(false);
    expect(requestEmailChangeSchema.parse({ address: " a@b.cl " }).address).toBe("a@b.cl");
  });

  it("no longer lets the profile update change the email", () => {
    expect(updateProfileRequestSchema.safeParse({ email: "a@b.cl" }).success).toBe(false);
    expect(updateProfileRequestSchema.safeParse({ name: "Simón" }).success).toBe(true);
  });

  it("identifies each address by a UUID v7", () => {
    const row = {
      address: "a@b.cl",
      status: "PRIMARY",
      verifiedAt: null,
      createdAt: "2026-10-10T00:00:00.000Z",
      replacedAt: null,
    };
    expect(
      userEmailSchema.safeParse({ ...row, id: "01a128bd-a70c-7e03-b071-0d9afd8d9c5f" }).success,
    ).toBe(true);
    expect(
      userEmailSchema.safeParse({ ...row, id: "6f1c1c2e-5b0a-4c2b-9a2f-1d2e3f4a5b6c" }).success,
    ).toBe(false);
  });
});
