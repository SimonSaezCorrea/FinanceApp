import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import {
  assertOriginsMatchRpId,
  getAllowedOrigins,
  getPasskeyRpId,
} from "../../../../src/infra/config/origins.config";

const config = (values: Record<string, string>) => new ConfigService(values);

describe("getAllowedOrigins", () => {
  it("reads a comma-separated list, trimming spaces", () => {
    expect(
      getAllowedOrigins(config({ CORS_ORIGIN: " https://cuadra.cl , https://app.cuadra.cl " })),
    ).toEqual(["https://cuadra.cl", "https://app.cuadra.cl"]);
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
    ["a path", "https://cuadra.cl/app"],
    ["a trailing slash", "https://cuadra.cl/"],
    ["no scheme", "cuadra.cl"],
    ["another scheme", "ftp://cuadra.cl"],
    ["an empty entry", "https://cuadra.cl,,https://app.cuadra.cl"],
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
          CORS_ORIGIN: "https://cuadra.cl,https://app.cuadra.cl",
          PASSKEY_RP_ID: "cuadra.cl",
        }),
      ),
    ).toBe("cuadra.cl");
  });
});

describe("assertOriginsMatchRpId", () => {
  it("accepts the rpId itself and its subdomains", () => {
    expect(() =>
      assertOriginsMatchRpId(
        config({
          CORS_ORIGIN: "https://cuadra.cl,https://app.cuadra.cl",
          PASSKEY_RP_ID: "cuadra.cl",
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
        config({ CORS_ORIGIN: "https://cuadra.cl,https://otro.cl", PASSKEY_RP_ID: "cuadra.cl" }),
      ),
    ).toThrow(/otro\.cl/);
  });

  it("refuses a lookalike that only ends with the rpId's text", () => {
    expect(() =>
      assertOriginsMatchRpId(
        config({ CORS_ORIGIN: "https://evilcuadra.cl", PASSKEY_RP_ID: "cuadra.cl" }),
      ),
    ).toThrow(/evilcuadra\.cl/);
  });
});
