import { z } from "zod";

/** Reference data contracts: countries, financial institutions, currencies (ISO 4217). Global, read-only. */

export const countrySchema = z.object({
  id: z.string(),
  /** ISO 3166-1 alpha-2 (e.g. "CL"). */
  alpha2: z.string(),
  /** ISO 3166-1 alpha-3 (e.g. "CHL"). */
  alpha3: z.string(),
  /** ISO 3166-1 numeric (e.g. "152"). */
  numeric: z.string(),
  name: z.string(),
});
export type Country = z.infer<typeof countrySchema>;

/** Bank sub-category (only meaningful for `kind = BANK`). */
export const bankCategory = z.enum(["ESTABLISHED", "FOREIGN_BRANCH", "STATE"]);
export type BankCategory = z.infer<typeof bankCategory>;

export const institutionKind = z.enum(["BANK", "NON_BANK_ISSUER"]);
export type InstitutionKind = z.infer<typeof institutionKind>;

/** A financial institution: a bank or a non-bank card issuer. */
export const institutionSchema = z.object({
  id: z.string(),
  countryId: z.string(),
  kind: institutionKind,
  /** Institutional/regulator code (SBIF/CMF for banks; código institucional for issuers). */
  code: z.string(),
  name: z.string(),
  /** Chilean tax id (RUT); null for banks / non-Chilean entities. */
  rut: z.string().nullable(),
  /** Bank sub-category; null for non-bank issuers. */
  category: bankCategory.nullable(),
  brands: z.array(z.string()),
  notes: z.string().nullable(),
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

/** Institution list filters: by country ISO alpha-2 and/or kind (`?country=CL&kind=BANK`). */
export const institutionFiltersSchema = z.object({
  country: z.string().trim().length(2).optional(),
  kind: institutionKind.optional(),
});
export type InstitutionFilters = z.infer<typeof institutionFiltersSchema>;
