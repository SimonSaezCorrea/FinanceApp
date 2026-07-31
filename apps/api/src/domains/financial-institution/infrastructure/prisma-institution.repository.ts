import { Injectable } from "@nestjs/common";
import type { FinancialInstitution as InstitutionRow } from "@prisma/client";

import type { reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { InstitutionRepositoryPort } from "../domain/ports/institution.repository.port";

function toContract(r: InstitutionRow): reference.Institution {
  return {
    id: r.id,
    countryId: r.countryId,
    kind: r.kind,
    code: r.code,
    name: r.name,
    rut: r.rut,
    category: r.category,
    brands: r.brands,
    notes: r.notes,
  };
}

/** Adapter (FR-011) — the only file in `reference` allowed to import
 * `FinancialInstitution` from `@prisma/client`. Global data, not user-scoped
 * (see `reference.module.ts`). */
@Injectable()
export class PrismaInstitutionRepository implements InstitutionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: reference.InstitutionFilters): Promise<reference.Institution[]> {
    const rows = await this.prisma.financialInstitution.findMany({
      where: {
        ...(filters.country ? { country: { alpha2: filters.country.toUpperCase() } } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
      },
      orderBy: { name: "asc" },
    });
    return rows.map(toContract);
  }
}
