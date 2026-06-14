/**
 * @finance/contracts — single source of truth for the API↔frontend contract.
 * zod schemas + inferred TS types, consumed by both apps (FR-005, FR-009).
 * One module per business domain is added here during the US2 migration.
 */
export * from "./common/errors";
export * as auth from "./auth/index";
export * as accounts from "./accounts/index";
export * as transactions from "./transactions/index";
export * as installments from "./installments/index";
export * as debts from "./debts/index";
export * as savings from "./savings/index";
export * as investments from "./investments/index";
export * as imports from "./import/index";

export const API_VERSION = "v1";
export const API_BASE_PATH = `/api/${API_VERSION}`;
