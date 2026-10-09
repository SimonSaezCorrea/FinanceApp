import { describe, expect, it, vi } from "vitest";

import { GetSessionStatusQuery } from "../../../../../../src/domains/user/application/queries/get-session-status.query";
import { GetSessionStatusQueryHandler } from "../../../../../../src/domains/user/application/queries/get-session-status.handler";
import type { TokenIssuer } from "../../../../../../src/domains/user/application/token-issuer";

const claims = { sub: "u1", sid: "s1" };
const invalid = () => {
  throw new Error("jwt expired");
};

function build({
  access = invalid,
  refresh = invalid,
  alive = true,
}: {
  access?: (t: string) => typeof claims;
  refresh?: (t: string) => typeof claims;
  alive?: boolean;
} = {}) {
  const tokens = { verifyAccess: vi.fn(access), verifyRefresh: vi.fn(refresh) };
  const sessions = { isAlive: vi.fn().mockResolvedValue(alive) };
  const handler = new GetSessionStatusQueryHandler(tokens as unknown as TokenIssuer, sessions);
  return { handler, tokens, sessions };
}

describe("GetSessionStatusQueryHandler", () => {
  it("is signed in with a valid access token whose session is alive", async () => {
    const { handler, sessions } = build({ access: () => claims });
    expect(await handler.execute(new GetSessionStatusQuery("at", undefined))).toEqual({
      signedIn: true,
    });
    expect(sessions.isAlive).toHaveBeenCalledWith("u1", "s1", expect.any(Date));
  });

  it("falls back to the refresh token when the access token expired", async () => {
    const { handler, tokens } = build({ refresh: () => claims });
    expect(await handler.execute(new GetSessionStatusQuery("expired", "rt"))).toEqual({
      signedIn: true,
    });
    expect(tokens.verifyRefresh).toHaveBeenCalledWith("rt");
  });

  it("is signed out when the session was closed, even with valid tokens", async () => {
    const { handler } = build({ access: () => claims, refresh: () => claims, alive: false });
    expect(await handler.execute(new GetSessionStatusQuery("at", "rt"))).toEqual({
      signedIn: false,
    });
  });

  it("is signed out with no cookies or tampered ones, without asking the database", async () => {
    const { handler, sessions } = build();
    expect(await handler.execute(new GetSessionStatusQuery(undefined, undefined))).toEqual({
      signedIn: false,
    });
    expect(await handler.execute(new GetSessionStatusQuery("forged", "forged"))).toEqual({
      signedIn: false,
    });
    expect(sessions.isAlive).not.toHaveBeenCalled();
  });
});
