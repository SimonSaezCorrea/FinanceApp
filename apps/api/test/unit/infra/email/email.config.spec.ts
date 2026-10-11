import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readEmailConfig } from "../../../../src/infra/email/email.config";

const config = (values: Record<string, string>) => new ConfigService(values);

describe("readEmailConfig", () => {
  // ConfigService falls back to process.env, which the test setup fills from apps/api/.env: blank
  // these so a developer's own values never change what the defaults look like here.
  beforeEach(() => {
    for (const key of ["EMAIL_FROM", "EMAIL_REPLY_TO", "PUBLIC_SITE_URL", "RESEND_API_KEY"]) {
      vi.stubEnv(key, "");
    }
  });
  afterEach(() => vi.unstubAllEnvs());

  it("delivers for real only in production with a Resend key", () => {
    const c = readEmailConfig(config({ NODE_ENV: "production", RESEND_API_KEY: "re_key" }));
    expect(c.delivery).toBe("resend");
    expect(c.resendApiKey).toBe("re_key");
  });

  it("turns sending off in production without a key", () => {
    expect(readEmailConfig(config({ NODE_ENV: "production" })).delivery).toBe("disabled");
  });

  it("never delivers outside production, even with a key in a local .env", () => {
    for (const env of ["development", "test", ""]) {
      const c = readEmailConfig(config({ NODE_ENV: env, RESEND_API_KEY: "re_key" }));
      expect(c.delivery).toBe("disabled");
      expect(c.resendApiKey).toBeNull();
    }
  });

  it("uses fik's sender, the contact address and the local site by default", () => {
    const c = readEmailConfig(config({}));
    expect(c.from).toBe("fik <no-reply@mifik.cl>");
    expect(c.replyTo).toBe("contacto@mifik.cl");
    expect(c.publicSiteUrl).toBe("http://localhost:4321");
  });

  it("drops trailing slashes from the site URL", () => {
    expect(readEmailConfig(config({ PUBLIC_SITE_URL: "https://mifik.cl///" })).publicSiteUrl).toBe(
      "https://mifik.cl",
    );
  });
});
