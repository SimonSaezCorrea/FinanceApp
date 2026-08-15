import { describe, expect, it } from "vitest";

import {
  accountNumberFormat,
  isValidAccountAlias,
  isValidAccountNumber,
  isValidCbu,
  usesAccountAlias,
} from "./account-number";

/** Fixtures built with the published weightings (block 1: 7,1,3,9,7,1,3 — block 2:
 * 3,9,7,1,3,9,7,1,3,9,7,1,3), so each block closes on its own check digit.
 * `0170099…` is a BBVA (017) branch; the CVU is a PSP-issued one. */
const VALID_CBU = "0170099220000067797158";
const VALID_CVU = "0000031400010000000009";

describe("isValidCbu", () => {
  it("accepts a well-formed CBU and a CVU (same scheme, different issuer)", () => {
    expect(isValidCbu(VALID_CBU)).toBe(true);
    expect(isValidCbu(VALID_CVU)).toBe(true);
  });

  it("ignores the separators people paste along with it", () => {
    expect(isValidCbu("0170 0992 2000 0067 7971 58")).toBe(true);
  });

  it("rejects a wrong check digit, which is the whole point of the scheme", () => {
    const broken = `${VALID_CBU.slice(0, 21)}${(Number(VALID_CBU[21]) + 1) % 10}`;
    expect(isValidCbu(broken)).toBe(false);
  });

  it("rejects anything that isn't 22 digits", () => {
    expect(isValidCbu("")).toBe(false);
    expect(isValidCbu("017009922000006779715")).toBe(false);
    expect(isValidCbu("01700992200000677971511")).toBe(false);
    expect(isValidCbu("0170099220000067797A51")).toBe(false);
  });
});

describe("account number by country", () => {
  it("knows Argentina uses the CBU/CVU scheme, with an alias on top", () => {
    expect(accountNumberFormat("AR")).toBe("CBU_CVU");
    expect(usesAccountAlias("AR")).toBe(true);
    expect(isValidAccountNumber(VALID_CBU, "AR")).toBe(true);
    expect(isValidAccountNumber("123", "AR")).toBe(false);
  });

  it("leaves Chile's free-text numbers alone: there is no format to enforce", () => {
    expect(accountNumberFormat("CL")).toBeNull();
    expect(usesAccountAlias("CL")).toBe(false);
    expect(isValidAccountNumber("001-2345678-90", "CL")).toBe(true);
  });

  it("accepts anything for a country whose format we don't know", () => {
    // A catalogue that hasn't reached a market must never block a real account.
    expect(isValidAccountNumber("whatever", "PY")).toBe(true);
    expect(isValidAccountNumber("whatever", undefined)).toBe(true);
  });

  it("still refuses an empty number: that is missing data, not a format we ignore", () => {
    expect(isValidAccountNumber("   ", "CL")).toBe(false);
  });
});

describe("isValidAccountAlias", () => {
  it("accepts the shape the market uses", () => {
    expect(isValidAccountAlias("mate.tango.mp")).toBe(true);
    expect(isValidAccountAlias("juan-perez_01")).toBe(true);
  });

  it("rejects spaces and lengths outside 6-20", () => {
    expect(isValidAccountAlias("mi alias")).toBe(false);
    expect(isValidAccountAlias("corto")).toBe(false);
    expect(isValidAccountAlias("a".repeat(21))).toBe(false);
  });
});
