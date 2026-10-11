import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, apiFetch, failureCode, resetAuthRefresh } from "./apiClient";

/**
 * The silent 401→refresh→retry path (quickstart.md scenario 13, SC-004).
 *
 * Before this feature the retried request was a plain replay of `init` — since
 * an idempotency key now travels inside `init.headers`, the retry carries it
 * automatically with no change to this file's own retry logic. This test is
 * what proves that claim rather than trusting the reasoning in research.md.
 */
describe("apiFetch — idempotency key survives the silent 401 retry", () => {
  beforeEach(() => {
    resetAuthRefresh();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resends the SAME Idempotency-Key header on the post-refresh retry", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });

        if (String(url).includes("/auth/refresh")) {
          return new Response(null, { status: 200 });
        }
        if (calls.filter((c) => !c.url.includes("/auth/refresh")).length === 1) {
          // First attempt on the real endpoint: session expired.
          return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 });
        }
        // Retry after refresh: succeeds.
        return new Response(JSON.stringify({ id: "t1" }), { status: 201 });
      }),
    );

    const result = await apiFetch("/transactions", {
      method: "POST",
      body: JSON.stringify({ amount: "1000" }),
      idempotencyKey: "retry-key-0000000000001",
    });

    expect(result).toEqual({ id: "t1" });

    const realCalls = calls.filter((c) => !c.url.includes("/auth/refresh"));
    expect(realCalls).toHaveLength(2);
    expect(realCalls[0]!.headers["idempotency-key"]).toBe("retry-key-0000000000001");
    // The exact property this scenario exists to prove: the retry is not a
    // fresh attempt with a fresh identity — it is the SAME attempt, replayed.
    expect(realCalls[1]!.headers["idempotency-key"]).toBe(realCalls[0]!.headers["idempotency-key"]);
  });

  it("never sends the header when the caller doesn't pass an idempotencyKey", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    );

    await apiFetch("/transactions");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(
      (init?.headers as Record<string, string> | undefined)?.["idempotency-key"],
    ).toBeUndefined();
  });
});

describe("apiFetch — which 401 renews the session", () => {
  beforeEach(() => {
    resetAuthRefresh();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A fetch where `path` answers 401 with `code` the first time and 200 after a refresh. */
  function stubExpiredOnce(code: string) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("/auth/refresh")) return new Response(null, { status: 204 });
        if (calls.filter((c) => !c.includes("/auth/refresh")).length === 1) {
          return new Response(JSON.stringify({ error: { code } }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    return calls;
  }

  it("renews an expired access token on /auth/me too (startup must not look signed out)", async () => {
    const calls = stubExpiredOnce("UNAUTHORIZED");
    await expect(apiFetch("/auth/me")).resolves.toEqual({ ok: true });
    expect(calls.filter((c) => c.includes("/auth/refresh"))).toHaveLength(1);
  });

  it("never retries a wrong credential (it would count twice against the lockout)", async () => {
    const calls = stubExpiredOnce("INVALID_CURRENT_PASSWORD");
    await expect(
      apiFetch("/auth/sessions/step-up", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD" });
    expect(calls.filter((c) => c.includes("/auth/refresh"))).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });
});

describe("failureCode", () => {
  it("names what failed: the API's code, no answer at all, or anything else", () => {
    expect(failureCode(new ApiRequestError("LOGIN_LOCKED", 429))).toBe("LOGIN_LOCKED");
    expect(failureCode(new TypeError("Failed to fetch"))).toBe("NETWORK_ERROR");
    expect(failureCode(new Error("boom"))).toBe("INTERNAL_ERROR");
  });

  it("tells a device with no network apart from a server that doesn't answer", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(failureCode(new TypeError("Failed to fetch"))).toBe("OFFLINE");
    vi.stubGlobal("navigator", { onLine: true });
    expect(failureCode(new TypeError("Failed to fetch"))).toBe("NETWORK_ERROR");
    vi.unstubAllGlobals();
  });
});
