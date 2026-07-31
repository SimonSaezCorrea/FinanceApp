import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { FinancialInstitutionLookupPort } from "../domain/ports/financial-institution-lookup.port";

/** Adapter for the name-lookup half of the `financial-institution` table. */
@Injectable()
export class PrismaFinancialInstitutionLookupRepository implements FinancialInstitutionLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async nameById(id: string): Promise<string | null> {
    const row = await this.prisma.financialInstitution.findUnique({ where: { id }, select: { name: true } });
    return row?.name ?? null;
  }

  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.financialInstitution.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
