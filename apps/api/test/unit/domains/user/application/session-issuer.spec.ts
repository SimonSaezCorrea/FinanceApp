import { describe, expect, it, vi } from "vitest";

import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { InvalidRefreshTokenError } from "../../../../../src/domains/user/domain/errors";
import type { SessionRepositoryPort } from "../../../../../src/domains/session/domain/ports/session.repository.port";

const TOKENS = {
  accessToken: "at",
  refreshToken: "rt",
  sessionId: "s1",
  sessionExpiresAt: new Date("2024-01-08T00:00:00Z"),
  refreshJti: "new-jti",
};

function fakeTokenIssuer(): TokenIssuer {
  return { issue: vi.fn().mockReturnValue(TOKENS) } as unknown as TokenIssuer;
}

function fakeSessionRepo(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn().mockResolvedValue({ ...TOKENS, id: TOKENS.sessionId }),
    listByUser: vi.fn(),
    rotateRefresh: vi.fn().mockResolvedValue("ROTATED"),
    closeOwned: vi.fn(),
    existsForUser: vi.fn(),
    closeAllExceptForUser: vi.fn(),
    closeAllExceptForUserWithTx: vi.fn(),
    closeAllForUserWithTx: vi.fn().mockResolvedValue(0),
    closeByPasskeysWithTx: vi.fn().mockResolvedValue(0),
    closeOnCompromisedPasskeysWithTx: vi.fn().mockResolvedValue(0),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeGeoIp(country: string | null = "CL", city: string | null = null): GeoIpLookup {
  return { lookup: vi.fn().mockResolvedValue({ country, city }) } as unknown as GeoIpLookup;
}

describe("SessionIssuer", () => {
  it("without reuseSessionId, creates a new Session row with the resolved device/country", async () => {
    const sessions = fakeSessionRepo();
    const geoIp = fakeGeoIp("CL");
    const issuer = new SessionIssuer(fakeTokenIssuer(), sessions, geoIp);

    const tokens = await issuer.establish(
      { id: "u1", email: "a@b.com" },
      { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0", ip: "1.2.3.4" },
    );

    expect(tokens).toBe(TOKENS);
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "s1",
        userId: "u1",
        country: "CL",
        expiresAt: TOKENS.sessionExpiresAt.toISOString(),
      }),
    );
    expect(sessions.rotateRefresh).not.toHaveBeenCalled();
  });

  it("with reuseSessionId, rotates the existing row's refresh jti — never creates a new one", async () => {
    const sessions = fakeSessionRepo();
    const issuer = new SessionIssuer(fakeTokenIssuer(), sessions, fakeGeoIp());

    await issuer.establish(
      { id: "u1", email: "a@b.com" },
      { reuseSessionId: "existing", presentedJti: "old-jti" },
    );

    expect(sessions.rotateRefresh).toHaveBeenCalledWith(
      "u1",
      "s1",
      "old-jti",
      TOKENS.refreshJti,
      expect.any(Date),
      TOKENS.sessionExpiresAt,
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("closes the session when an already-rotated refresh token comes back (run-3)", async () => {
    const sessions = fakeSessionRepo({ rotateRefresh: vi.fn().mockResolvedValue("REUSED") });
    const issuer = new SessionIssuer(fakeTokenIssuer(), sessions, fakeGeoIp());

    await expect(
      issuer.establish({ id: "u1", email: "a@b.com" }, { reuseSessionId: "s1", presentedJti: "x" }),
    ).rejects.toThrow(InvalidRefreshTokenError);
    expect(sessions.closeById).toHaveBeenCalledWith("s1");
  });

  it("throws InvalidRefreshTokenError when the session to reuse no longer exists", async () => {
    const sessions = fakeSessionRepo({ rotateRefresh: vi.fn().mockResolvedValue("GONE") });
    const issuer = new SessionIssuer(fakeTokenIssuer(), sessions, fakeGeoIp());

    await expect(
      issuer.establish({ id: "u1", email: "a@b.com" }, { reuseSessionId: "closed" }),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it("a missing/unresolvable geo lookup still creates the session, just without a country", async () => {
    const sessions = fakeSessionRepo();
    const issuer = new SessionIssuer(fakeTokenIssuer(), sessions, fakeGeoIp(null));

    await issuer.establish({ id: "u1", email: "a@b.com" }, {});

    expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ country: null }));
  });
});
