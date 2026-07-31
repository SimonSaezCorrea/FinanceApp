import type { Debt, PlannedDebt } from "../debt.aggregate";

export const DEBT_REPOSITORY = Symbol("DEBT_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface DebtRepositoryPort {
  list(userId: string): Promise<Debt[]>;
  findOne(userId: string, id: string): Promise<Debt | null>;
  create(userId: string, plan: PlannedDebt): Promise<Debt>;
  save(aggregate: Debt): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}
