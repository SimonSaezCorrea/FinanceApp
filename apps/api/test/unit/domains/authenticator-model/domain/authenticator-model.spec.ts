import { describe, expect, it } from "vitest";

import {
  compromisedStatusOf,
  isCatalogCurrent,
} from "../../../../../src/domains/authenticator-model/domain/authenticator-model";

describe("authenticator-model (specs/041)", () => {
  it("no reports, or a certification only, is not compromised", () => {
    expect(compromisedStatusOf([])).toBeNull();
    expect(
      compromisedStatusOf([{ status: "FIDO_CERTIFIED_L1", effectiveDate: "2024-01-01" }]),
    ).toBeNull();
  });

  it("REVOKED and the four compromise statuses count, with their date", () => {
    for (const status of [
      "REVOKED",
      "USER_VERIFICATION_BYPASS",
      "ATTESTATION_KEY_COMPROMISE",
      "USER_KEY_REMOTE_COMPROMISE",
      "USER_KEY_PHYSICAL_COMPROMISE",
    ]) {
      const result = compromisedStatusOf([
        { status: "FIDO_CERTIFIED", effectiveDate: "2023-01-01" },
        { status, effectiveDate: "2025-06-01" },
      ]);
      expect(result?.status).toBe(status);
      expect(result?.date?.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    }
  });

  it("only the latest report counts: a later fix clears a compromise", () => {
    expect(
      compromisedStatusOf([
        { status: "ATTESTATION_KEY_COMPROMISE", effectiveDate: "2025-01-01" },
        { status: "UPDATE_AVAILABLE", effectiveDate: "2025-03-01" },
      ]),
    ).toBeNull();
    expect(
      compromisedStatusOf([
        { status: "UPDATE_AVAILABLE", effectiveDate: "2025-03-01" },
        { status: "REVOKED", effectiveDate: "2025-01-01" },
      ]),
    ).toBeNull();
  });

  it("a catalog past its next update no longer marks passkeys", () => {
    const now = new Date("2026-11-05T00:00:00Z");
    expect(isCatalogCurrent({ number: 1, nextUpdate: new Date("2026-12-01") }, now)).toBe(true);
    expect(isCatalogCurrent({ number: 1, nextUpdate: new Date("2026-11-01") }, now)).toBe(false);
  });
});
