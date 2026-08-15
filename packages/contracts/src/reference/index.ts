import { z } from "zod";

import { accountType } from "../common/account-type";

/** Reference data contracts: countries, financial institutions, currencies (ISO 4217). Global, read-only. */

/** National identity document vocabulary — which types a country supports is data (see
 * `Country.identifierTypes` below), not fixed per value; a country may support more than one. */
export const identifierTypeSchema = z.enum(["RUT", "DNI", "PASSPORT", "OTHER"]);
export type IdentifierType = z.infer<typeof identifierTypeSchema>;

export const countrySchema = z.object({
  id: z.string(),
  /** ISO 3166-1 alpha-2 (e.g. "CL"). */
  alpha2: z.string(),
  /** ISO 3166-1 alpha-3 (e.g. "CHL"). */
  alpha3: z.string(),
  /** ISO 3166-1 numeric (e.g. "152"). */
  numeric: z.string(),
  name: z.string(),
  /** National identity document types this country supports, primary one first. */
  identifierTypes: z.array(identifierTypeSchema),
  /** International calling code with leading "+" (e.g. "+56"), or null if not seeded. Used to
   * prefix phone numbers so the user never has to type it. */
  callingCode: z.string().nullable(),
});
export type Country = z.infer<typeof countrySchema>;

/** Bank sub-category (only meaningful for `kind = BANK`). */
export const bankCategory = z.enum(["ESTABLISHED", "FOREIGN_BRANCH", "STATE"]);
export type BankCategory = z.infer<typeof bankCategory>;

/** What the entity IS in regulatory terms — never what it sells (that is
 * `accountTypes`): a non-bank issuer may hold the prepaid licence, the credit-card
 * one, or both, and a cooperative takes deposits without being a bank. */
export const institutionKind = z.enum(["BANK", "NON_BANK_ISSUER", "COOPERATIVE"]);
export type InstitutionKind = z.infer<typeof institutionKind>;

/** A financial institution: a bank or a non-bank card issuer. */
export const institutionSchema = z.object({
  id: z.string(),
  countryId: z.string(),
  kind: institutionKind,
  /** Institutional/regulator code (SBIF/CMF for banks; código institucional for issuers). */
  code: z.string(),
  /** COMMERCIAL name — what the user recognises. The registry's legal name is
   * `legalName`: nobody looks for "Compañía Emisora de Medios de Pago Digitales
   * S.A." when topping up their Copec Pay. */
  name: z.string(),
  /** Registered legal name, when it differs from the commercial one. Searchable,
   * never the label. */
  legalName: z.string().nullable(),
  /** Bank sub-category; null for non-bank issuers. */
  category: bankCategory.nullable(),
  brands: z.array(z.string()),
  notes: z.string().nullable(),
  /** Whether it sells to individuals. Corporate-only entities stay listed but the
   * pickers hide them by default (`?retailFacing=true`). */
  retailFacing: z.boolean(),
  /**
   * Which account products this institution offers, its flagship one first —
   * data, not something derivable from `kind`: Tenpo is a NON_BANK_ISSUER that
   * offers PREPAID today and may offer CHECKING tomorrow, and a foreign branch
   * is a BANK with a much narrower catalogue than a local one.
   *
   * An EMPTY list means "not catalogued yet", never "offers nothing" — the
   * institution is then shown for every account type (see `accountType` below).
   */
  accountTypes: z.array(accountType),
});
export type Institution = z.infer<typeof institutionSchema>;

export const currencySchema = z.object({
  id: z.string(),
  /** ISO 4217 alpha code (e.g. "CLP"). */
  code: z.string(),
  /** ISO 4217 numeric code (e.g. "152"). */
  numeric: z.string(),
  name: z.string(),
});
export type Currency = z.infer<typeof currencySchema>;

/**
 * Institution list filters: by country ISO alpha-2, kind and/or the account
 * product on offer (`?country=CL&kind=BANK&accountType=PREPAID`).
 *
 * `accountType` is deliberately PERMISSIVE: an institution with no catalogued
 * products passes every filter. A reference catalogue always lags reality, so a
 * missing row must never make a real bank disappear from the picker.
 */
export const institutionFiltersSchema = z.object({
  country: z.string().trim().length(2).optional(),
  kind: institutionKind.optional(),
  accountType: accountType.optional(),
  /** `true` drops the corporate-only entities from the list. */
  retailFacing: z.coerce.boolean().optional(),
});
export type InstitutionFilters = z.infer<typeof institutionFiltersSchema>;
