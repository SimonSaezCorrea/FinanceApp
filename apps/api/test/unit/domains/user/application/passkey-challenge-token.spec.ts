import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { PasskeyChallengeToken } from "../../../../../src/domains/user/application/passkey-challenge-token";
import { PasskeyChallengeInvalidError } from "../../../../../src/domains/user/domain/errors";

function build(): PasskeyChallengeToken {
  const config = new ConfigService({ PASSKEY_CHALLENGE_SECRET: "test-secret" });
  return new PasskeyChallengeToken(new JwtService(), config);
}

describe("PasskeyChallengeToken", () => {
  it("round-trips a challenge with a resolved userId", () => {
    const token = build();
    const issued = token.issue({ challenge: "abc123", userId: "u1", discoverable: false });
    const verified = token.verify(issued);
    expect(verified).toEqual({ challenge: "abc123", userId: "u1", discoverable: false });
  });

  it("round-trips a challenge with userId: null (email had no passkeys)", () => {
    const token = build();
    const issued = token.issue({ challenge: "xyz", userId: null, discoverable: true });
    expect(token.verify(issued)).toEqual({ challenge: "xyz", userId: null, discoverable: true });
  });

  it("throws PasskeyChallengeInvalidError on a malformed token", () => {
    const token = build();
    expect(() => token.verify("not-a-real-jwt")).toThrow(PasskeyChallengeInvalidError);
  });

  it("throws PasskeyChallengeInvalidError on an empty token", () => {
    const token = build();
    expect(() => token.verify("")).toThrow(PasskeyChallengeInvalidError);
  });
});
