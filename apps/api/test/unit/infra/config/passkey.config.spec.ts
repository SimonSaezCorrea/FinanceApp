import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import {
  getPasskeyExpectedOrigins,
  getPasskeyRpId,
} from "../../../../src/infra/config/passkey.config";

/** US6 (specs/031): one passkey works on the public site and in the app. */
describe("passkey config", () => {
  const config = new ConfigService({
    CORS_ORIGIN: "https://mifik.cl,https://app.mifik.cl",
    PASSKEY_RP_ID: "mifik.cl",
  });

  it("accepts a ceremony from every allowed origin", () => {
    expect(getPasskeyExpectedOrigins(config)).toEqual(["https://mifik.cl", "https://app.mifik.cl"]);
  });

  it("uses the parent domain as rpId", () => {
    expect(getPasskeyRpId(config)).toBe("mifik.cl");
  });
});
