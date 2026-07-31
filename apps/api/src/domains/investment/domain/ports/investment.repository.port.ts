import type { Investment, PlannedInvestment } from "../investment.aggregate";

export const INVESTMENT_REPOSITORY = Symbol("INVESTMENT_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface InvestmentRepositoryPort {
  list(userId: string): Promise<Investment[]>;
  findOne(userId: string, id: string): Promise<Investment | null>;
  create(userId: string, plan: PlannedInvestment): Promise<Investment>;
  save(aggregate: Investment): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}
