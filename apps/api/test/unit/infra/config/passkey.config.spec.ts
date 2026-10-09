import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import {
  getPasskeyExpectedOrigins,
  getPasskeyRpId,
} from "../../../../src/infra/config/passkey.config";

/** US6 (specs/031): one passkey works on the public site and in the app. */
describe("passkey config", () => {
  const config = new ConfigService({
    CORS_ORIGIN: "https://cuadra.cl,https://app.cuadra.cl",
    PASSKEY_RP_ID: "cuadra.cl",
  });

  it("accepts a ceremony from every allowed origin", () => {
    expect(getPasskeyExpectedOrigins(config)).toEqual(["https://cuadra.cl", "https://app.cuadra.cl"]);
  });

  it("uses the parent domain as rpId", () => {
    expect(getPasskeyRpId(config)).toBe("cuadra.cl");
  });
});
