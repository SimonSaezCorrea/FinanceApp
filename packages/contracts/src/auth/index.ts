import { z } from "zod";

import { isValidRut } from "./rut";
import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";
import { identifierTypeSchema } from "../reference";

export * from "./rut";

/** Auth domain contracts (seed; expanded during US2 auth migration). */

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const registerRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Moneda principal del usuario. El MVP opera en Chile con tres monedas: peso,
 * dólar y `CLF` (el código ISO 4217 de la UF, que la app nunca convierte a pesos). */
export const preferredCurrencySchema = z.enum(["CLP", "USD", "CLF"]);
/** Any ISO 4217 alpha code from the reference `Currency` list (not restricted like the primary currency). */
export const currencyCodeSchema = z.string().trim().length(3);
export const localeSchema = z.enum(["es", "en"]);
export const dateFormatSchema = z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);
export const themeSchema = z.enum(["dark", "light", "system"]);

export const currentUserSchema = z.object({
  id: rowId,
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  preferredCurrency: preferredCurrencySchema,
  locale: localeSchema,
  dateFormat: dateFormatSchema,
  theme: themeSchema,
  memberSinceYear: z.number(),
  countryId: rowId.nullable(),
  countryName: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressRegion: z.string().nullable(),
  addressPostalCode: z.string().nullable(),
  /** ISO date string ("YYYY-MM-DD"), for hydrating the edit form. The main Profile view only
   * ever renders the derived `age` below — hiding the exact date is a UI choice, not an API one. */
  birthDate: z.string().nullable(),
  /** Full years elapsed since birthDate, or null if unset. Computed on-read. */
  age: z.number().nullable(),
  identifierType: identifierTypeSchema.nullable(),
  identifierValue: z.string().nullable(),
  phone: z.string().nullable(),
  /** Masks monetary amounts across the app when true (real effect, partial coverage — see PENDING.md). */
  hideBalances: z.boolean(),
  monthlyBudgetTarget: moneyString.nullable(),
  /** Day of month (1-28) the user's financial cycle starts. Stored, not yet wired anywhere (PENDING.md). */
  billingCycleStartDay: z.number().int().min(1).max(28).nullable(),
  /** Extra currencies the user wants tracked, on top of preferredCurrency (any ISO 4217 code from
   * the reference `Currency` list — not restricted to the primary three). Selection only — no live FX. */
  extraCurrencies: z.array(currencyCodeSchema),
  /** % of monthlyBudgetTarget to warn at. Stored for the Notifications UI only — no real alert is sent. */
  budgetAlertThreshold: z.number().int().min(1).max(100).nullable(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const updateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().optional(),
    countryId: rowId.nullable().optional(),
    addressStreet: z.string().trim().max(200).nullable().optional(),
    addressCity: z.string().trim().max(120).nullable().optional(),
    addressRegion: z.string().trim().max(120).nullable().optional(),
    addressPostalCode: z.string().trim().max(20).nullable().optional(),
    birthDate: z.coerce.date().nullable().optional(),
    identifierType: identifierTypeSchema.nullable().optional(),
    identifierValue: z.string().trim().max(30).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
  })
  .refine(
    (data) =>
      data.identifierType !== "RUT" || !data.identifierValue || isValidRut(data.identifierValue),
    { message: "invalid_rut", path: ["identifierValue"] },
  );
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const updatePreferencesRequestSchema = z.object({
  preferredCurrency: preferredCurrencySchema.optional(),
  locale: localeSchema.optional(),
  dateFormat: dateFormatSchema.optional(),
  theme: themeSchema.optional(),
  hideBalances: z.boolean().optional(),
  monthlyBudgetTarget: moneyString.nullable().optional(),
  billingCycleStartDay: z.number().int().min(1).max(28).nullable().optional(),
  extraCurrencies: z.array(currencyCodeSchema).optional(),
  budgetAlertThreshold: z.number().int().min(1).max(100).nullable().optional(),
});
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;

export const deactivateRequestSchema = z.object({
  password: z.string().min(1),
});
export type DeactivateRequest = z.infer<typeof deactivateRequestSchema>;
