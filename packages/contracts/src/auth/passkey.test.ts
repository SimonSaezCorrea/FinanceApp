import { describe, expect, it } from "vitest";

import {
  isPasskeyUsable,
  passkeyRegistrationSuggestionResponseSchema,
  passkeySchema,
} from "./index";

const base = {
  id: "0192f2a0-0000-7000-8000-000000000001",
  name: "Mi llave",
  createdAt: "2026-11-05T00:00:00.000Z",
  lastUsedAt: null,
};

describe("passkey (specs/041)", () => {
  it("parses a passkey from an API before specs/041", () => {
    expect(passkeySchema.parse(base).status).toBeUndefined();
  });

  it("parses the authenticator model and status", () => {
    const parsed = passkeySchema.parse({
      ...base,
      status: "verified",
      authenticatorName: "YubiKey 5 Series with NFC",
      compromisedAt: null,
    });
    expect(parsed.authenticatorName).toBe("YubiKey 5 Series with NFC");
  });

  it("only a compromised passkey is unusable", () => {
    expect(isPasskeyUsable({ status: undefined })).toBe(true);
    expect(isPasskeyUsable({ status: "verified" })).toBe(true);
    expect(isPasskeyUsable({ status: "compromised" })).toBe(false);
  });

  it("a suggestion may have no name", () => {
    expect(passkeyRegistrationSuggestionResponseSchema.parse({ suggestedName: null })).toEqual({
      suggestedName: null,
    });
  });
});
