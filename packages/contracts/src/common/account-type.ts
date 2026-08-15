import { z } from "zod";

/**
 * Account-type vocabulary. It lives in `common/` rather than in `accounts/`
 * because two modules need it and they can't import each other: `accounts`
 * already imports `InstitutionKind` from `reference`, and `reference` needs
 * this enum for `Institution.accountTypes` (which products an institution
 * offers). `accounts` re-exports it, so every existing call site is unchanged.
 */
export const accountType = z.enum([
  "CHECKING", // Corriente
  "SIGHT", // Vista / Cuenta RUT
  "SAVINGS", // Ahorro
  "INVESTMENT", // Inversiones (Fintual)
  // Cuenta de tarjeta de crédito: deuda rotativa con su propia facturación, ciclo y
  // pago mínimo. NO es la "línea de crédito" de una cuenta corriente — eso es el
  // sobregiro, que vive como `overdraftLimit` en la cuenta que lo tiene.
  "CREDIT_CARD",
  "PREPAID", // Cuenta prepago: fondos provisionados, sin crédito, saldo nunca negativo
  "CASH", // Efectivo
]);
export type AccountType = z.infer<typeof accountType>;
