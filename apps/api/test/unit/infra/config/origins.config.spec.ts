import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import {
  assertOriginsMatchRpId,
  getAllowedOrigins,
  getPasskeyRpId,
  requiresSecureCookies,
} from "../../../../src/infra/config/origins.config";

const config = (values: Record<string, string>) => new ConfigService(values);

describe("getAllowedOrigins", () => {
  it("reads a comma-separated list, trimming spaces", () => {
    expect(
      getAllowedOrigins(config({ CORS_ORIGIN: " https://mifik.cl , https://app.mifik.cl " })),
    ).toEqual(["https://mifik.cl", "https://app.mifik.cl"]);
  });

  it("still accepts the single origin of before", () => {
    expect(getAllowedOrigins(config({ CORS_ORIGIN: "http://localhost:5173" }))).toEqual([
      "http://localhost:5173",
    ]);
  });

  it("defaults to the local app when unset", () => {
    // ConfigService falls back to process.env, which the test setup fills from .env.
    const saved = process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGIN;
    try {
      expect(getAllowedOrigins(config({}))).toEqual(["http://localhost:5173"]);
    } finally {
      process.env.CORS_ORIGIN = saved;
    }
  });

  it.each([
    ["a path", "https://mifik.cl/app"],
    ["a trailing slash", "https://mifik.cl/"],
    ["no scheme", "mifik.cl"],
    ["another scheme", "ftp://mifik.cl"],
    ["an empty entry", "https://mifik.cl,,https://app.mifik.cl"],
  ])("refuses an origin with %s", (_, value) => {
    expect(() => getAllowedOrigins(config({ CORS_ORIGIN: value }))).toThrow(/CORS_ORIGIN/);
  });
});

describe("getPasskeyRpId", () => {
  it("defaults to the first origin's hostname", () => {
    expect(
      getPasskeyRpId(config({ CORS_ORIGIN: "http://localhost:4321,http://localhost:5173" })),
    ).toBe("localhost");
  });

  it("uses PASSKEY_RP_ID when set", () => {
    expect(
      getPasskeyRpId(
        config({
          CORS_ORIGIN: "https://mifik.cl,https://app.mifik.cl",
          PASSKEY_RP_ID: "mifik.cl",
        }),
      ),
    ).toBe("mifik.cl");
  });
});

describe("assertOriginsMatchRpId", () => {
  it("accepts the rpId itself and its subdomains", () => {
    expect(() =>
      assertOriginsMatchRpId(
        config({
          CORS_ORIGIN: "https://mifik.cl,https://app.mifik.cl",
          PASSKEY_RP_ID: "mifik.cl",
        }),
      ),
    ).not.toThrow();
  });

  it("accepts localhost on several ports", () => {
    expect(() =>
      assertOriginsMatchRpId(
        config({ CORS_ORIGIN: "http://localhost:4321,http://localhost:5173" }),
      ),
    ).not.toThrow();
  });

  it("refuses an origin outside the rpId, where a passkey could never work", () => {
    expect(() =>
      assertOriginsMatchRpId(
        config({ CORS_ORIGIN: "https://mifik.cl,https://otro.cl", PASSKEY_RP_ID: "mifik.cl" }),
      ),
    ).toThrow(/otro\.cl/);
  });

  it("refuses a lookalike that only ends with the rpId's text", () => {
    expect(() =>
      assertOriginsMatchRpId(
        config({ CORS_ORIGIN: "https://evilmifik.cl", PASSKEY_RP_ID: "mifik.cl" }),
      ),
    ).toThrow(/evilmifik\.cl/);
  });
});

describe("requiresSecureCookies", () => {
  it("is off only when every origin is plain http on loopback (local development)", () => {
    expect(
      requiresSecureCookies(
        config({
          CORS_ORIGIN: "http://localhost:4321,http://localhost:5173,http://127.0.0.1:3000",
        }),
      ),
    ).toBe(false);
  });

  it("is on for any real deployment, whatever NODE_ENV says", () => {
    expect(
      requiresSecureCookies(
        config({ CORS_ORIGIN: "https://mifik.cl,https://app.mifik.cl", NODE_ENV: "development" }),
      ),
    ).toBe(true);
  });

  it("is on when even one origin is not local http", () => {
    expect(
      requiresSecureCookies(config({ CORS_ORIGIN: "http://localhost:5173,https://app.mifik.cl" })),
    ).toBe(true);
    expect(requiresSecureCookies(config({ CORS_ORIGIN: "https://localhost:5173" }))).toBe(true);
    expect(requiresSecureCookies(config({ CORS_ORIGIN: "http://192.168.1.20:5173" }))).toBe(true);
  });
});
