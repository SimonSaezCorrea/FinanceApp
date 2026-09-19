import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";

function issuer(): TokenIssuer {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: "access-secret",
    JWT_REFRESH_SECRET: "refresh-secret",
    JWT_ACCESS_EXPIRES: "15m",
    JWT_REFRESH_EXPIRES: "7d",
  });
  return new TokenIssuer(new JwtService({}), config);
}

describe("TokenIssuer", () => {
  it("mints a fresh session id (sid) when none is given, embedded in both tokens", () => {
    const tokenIssuer = issuer();
    const { accessToken, refreshToken, sessionId } = tokenIssuer.issue({
      id: "u1",
      email: "a@b.com",
    });

    const accessPayload = new JwtService({}).decode(accessToken) as { sid: string };
    const refreshPayload = new JwtService({}).decode(refreshToken) as { sid: string };
    expect(accessPayload.sid).toBe(sessionId);
    expect(refreshPayload.sid).toBe(sessionId);
  });

  it("two logins in a row mint two different session ids", () => {
    const tokenIssuer = issuer();
    const first = tokenIssuer.issue({ id: "u1", email: "a@b.com" });
    const second = tokenIssuer.issue({ id: "u1", email: "a@b.com" });
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it("reuses the given session id (a refresh rotating its tokens) instead of minting a new one", () => {
    const tokenIssuer = issuer();
    const { accessToken, refreshToken, sessionId } = tokenIssuer.issue(
      { id: "u1", email: "a@b.com" },
      "existing-session-id",
    );

    expect(sessionId).toBe("existing-session-id");
    const accessPayload = new JwtService({}).decode(accessToken) as { sid: string };
    const refreshPayload = new JwtService({}).decode(refreshToken) as { sid: string };
    expect(accessPayload.sid).toBe("existing-session-id");
    expect(refreshPayload.sid).toBe("existing-session-id");
  });

  it("computes sessionExpiresAt from JWT_REFRESH_EXPIRES", () => {
    const tokenIssuer = issuer();
    const before = Date.now();
    const { sessionExpiresAt } = tokenIssuer.issue({ id: "u1", email: "a@b.com" });
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(sessionExpiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(sessionExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + sevenDaysMs + 1000);
  });

  it("verifyRefresh returns both sub and sid", () => {
    const tokenIssuer = issuer();
    const { refreshToken, sessionId } = tokenIssuer.issue({ id: "u1", email: "a@b.com" });
    const payload = tokenIssuer.verifyRefresh(refreshToken);
    expect(payload).toMatchObject({ sub: "u1", sid: sessionId });
  });
});
