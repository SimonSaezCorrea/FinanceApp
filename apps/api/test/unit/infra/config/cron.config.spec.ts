import { describe, expect, it } from "vitest";

import { cronsEnabled } from "../../../../src/infra/config/cron.config";

function config(env: Record<string, string | undefined>) {
  return { get: <T>(key: string) => env[key] as T };
}

describe("cronsEnabled", () => {
  it("is on in production and off anywhere else by default", () => {
    expect(cronsEnabled(config({ NODE_ENV: "production" }))).toBe(true);
    expect(cronsEnabled(config({ NODE_ENV: "development" }))).toBe(false);
    expect(cronsEnabled(config({ NODE_ENV: "test" }))).toBe(false);
    expect(cronsEnabled(config({}))).toBe(false);
  });

  it("lets CRONS_ENABLED override it either way", () => {
    expect(cronsEnabled(config({ NODE_ENV: "development", CRONS_ENABLED: "true" }))).toBe(true);
    expect(cronsEnabled(config({ NODE_ENV: "production", CRONS_ENABLED: "false" }))).toBe(false);
    expect(cronsEnabled(config({ CRONS_ENABLED: " TRUE " }))).toBe(true);
  });

  it("fails at boot on any other value instead of guessing", () => {
    expect(() => cronsEnabled(config({ CRONS_ENABLED: "yes" }))).toThrow(/CRONS_ENABLED/);
  });
});
