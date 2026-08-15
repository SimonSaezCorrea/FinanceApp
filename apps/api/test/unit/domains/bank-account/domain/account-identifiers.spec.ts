import { describe, expect, it } from "vitest";

import { BankAccount } from "../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  InvalidAccountAliasError,
  InvalidAccountNumberError,
} from "../../../../../src/domains/bank-account/domain/errors";

const VALID_CBU = "0170099220000067797158";

/**
 * The format belongs to the country, and the country comes from the institution.
 * The rule is enforced HERE (not only in the form) so the API answers the same
 * thing the UI shows.
 */
describe("BankAccount.assertAccountIdentifiers", () => {
  it("accepts a well-formed CBU on an Argentine account", () => {
    expect(() =>
      BankAccount.assertAccountIdentifiers({ countryAlpha2: "AR", accountNumber: VALID_CBU }),
    ).not.toThrow();
  });

  it("refuses a number that isn't a CBU when the country is Argentina", () => {
    expect(() =>
      BankAccount.assertAccountIdentifiers({ countryAlpha2: "AR", accountNumber: "123456" }),
    ).toThrow(InvalidAccountNumberError);
  });

  it("leaves Chile's free-text numbers alone", () => {
    expect(() =>
      BankAccount.assertAccountIdentifiers({
        countryAlpha2: "CL",
        accountNumber: "001-2345678-90",
      }),
    ).not.toThrow();
  });

  it("accepts anything when the account has no institution to place it", () => {
    // Cash, or an account entered by hand: there is no country, so no rule.
    expect(() =>
      BankAccount.assertAccountIdentifiers({ countryAlpha2: null, accountNumber: "whatever" }),
    ).not.toThrow();
  });

  it("validates the alias whenever one is sent", () => {
    expect(() =>
      BankAccount.assertAccountIdentifiers({ countryAlpha2: "AR", accountAlias: "mate.tango.mp" }),
    ).not.toThrow();
    expect(() =>
      BankAccount.assertAccountIdentifiers({ countryAlpha2: "AR", accountAlias: "con espacio" }),
    ).toThrow(InvalidAccountAliasError);
  });

  it("ignores empty identifiers: absent is not invalid", () => {
    expect(() =>
      BankAccount.assertAccountIdentifiers({
        countryAlpha2: "AR",
        accountNumber: "  ",
        accountAlias: "",
      }),
    ).not.toThrow();
  });
});
