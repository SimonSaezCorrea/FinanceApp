import type { User } from "../user.aggregate";

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(plan: { email: string; name?: string; passwordHash: string }): Promise<User>;
  /** Persists every profile/preferences/security field this aggregate owns. */
  save(user: User): Promise<void>;
  /** A linked country's display name (mirrors `accounts`' `institutionName` lookup). */
  countryName(id: string): Promise<string | null>;
}
