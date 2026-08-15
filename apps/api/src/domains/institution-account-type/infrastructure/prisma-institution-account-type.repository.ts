import { Injectable } from "@nestjs/common";

import type { accounts } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  InstitutionAccountTypeRepositoryPort,
  InstitutionCatalogue,
} from "../domain/ports/institution-account-type.repository.port";

/** Adapter — the ONLY file that touches `prisma.institutionAccountType`. */
@Injectable()
export class PrismaInstitutionAccountTypeRepository implements InstitutionAccountTypeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByInstitutions(institutionIds: string[]): Promise<Map<string, accounts.AccountType[]>> {
    if (institutionIds.length === 0) return new Map();
    const rows = await this.prisma.institutionAccountType.findMany({
      where: { institutionId: { in: institutionIds } },
      orderBy: { isPrimary: "desc" },
      select: { institutionId: true, type: true },
    });
    const byInstitution = new Map<string, accounts.AccountType[]>();
    for (const row of rows) {
      const bucket = byInstitution.get(row.institutionId) ?? [];
      bucket.push(row.type);
      byInstitution.set(row.institutionId, bucket);
    }
    return byInstitution;
  }

  async catalogueFor(type: accounts.AccountType): Promise<InstitutionCatalogue> {
    // The whole table is a seeded catalogue of a few hundred rows; reading it in
    // one pass is cheaper than two queries and keeps both sets consistent.
    const rows = await this.prisma.institutionAccountType.findMany({
      select: { institutionId: true, type: true },
    });
    const offering = new Set<string>();
    const catalogued = new Set<string>();
    for (const row of rows) {
      catalogued.add(row.institutionId);
      if (row.type === type) offering.add(row.institutionId);
    }
    return { offering, catalogued };
  }
}
