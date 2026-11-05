import { describe, expect, it } from "vitest";

import {
  confirmMfaEnrollmentResponseSchema,
  loginResponseSchema,
  startMfaEnrollmentResponseSchema,
  stepUpMethodsFor,
  stepUpRequestSchema,
  verifyMfaLoginRequestSchema,
} from "./index";

describe("stepUpMethodsFor (specs/040)", () => {
  it("offers the account's own second factor, then a passkey", () => {
    expect(stepUpMethodsFor({ mfaMethod: "totp", passkeyCount: 0 })).toEqual(["totp"]);
    expect(stepUpMethodsFor({ mfaMethod: "email", passkeyCount: 1 })).toEqual(["email", "passkey"]);
  });

  it("falls back to the password only when there is no second factor at all", () => {
    expect(stepUpMethodsFor({ mfaMethod: null, passkeyCount: 0 })).toEqual(["password"]);
    expect(stepUpMethodsFor({ mfaMethod: null, passkeyCount: 2 })).toEqual(["passkey"]);
  });

  it("keeps the older mfaEnabled shape meaning the authenticator app", () => {
    expect(stepUpMethodsFor({ mfaEnabled: true, passkeyCount: 0 })).toEqual(["totp"]);
    expect(stepUpMethodsFor({ mfaEnabled: false, passkeyCount: 0 })).toEqual(["password"]);
  });
});

describe("MFA contracts (specs/040)", () => {
  it("accepts an email step-up code of 6 digits only", () => {
    expect(stepUpRequestSchema.safeParse({ method: "email", code: "123456" }).success).toBe(true);
    expect(stepUpRequestSchema.safeParse({ method: "email", code: "ABCD-EFGH" }).success).toBe(
      false,
    );
  });

  it("defaults rememberDevice to false", () => {
    expect(verifyMfaLoginRequestSchema.parse({ code: "123456" }).rememberDevice).toBe(false);
  });

  it("reads a login response from an older API without mfaMethod", () => {
    expect(loginResponseSchema.parse({ mfaRequired: true })).toEqual({ mfaRequired: true });
    expect(
      loginResponseSchema.parse({
        mfaRequired: true,
        mfaMethod: "email",
        codeSent: false,
        retryAfterSeconds: 42,
      }),
    ).toMatchObject({ mfaMethod: "email", retryAfterSeconds: 42 });
  });

  it("reads both enrollment responses, and the old one without method", () => {
    expect(
      startMfaEnrollmentResponseSchema.safeParse({ qrCodeDataUrl: "x", secret: "y" }).success,
    ).toBe(true);
    expect(
      startMfaEnrollmentResponseSchema.safeParse({ method: "email", codeSent: true }).success,
    ).toBe(true);
  });

  it("confirms a method change without new recovery codes", () => {
    expect(confirmMfaEnrollmentResponseSchema.parse({ recoveryCodes: null })).toEqual({
      recoveryCodes: null,
    });
  });
});
