import { Inject, Injectable } from "@nestjs/common";
import type { FinancialInstitution as InstitutionRow } from "@prisma/client";

import type { accounts, reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  INSTITUTION_ACCOUNT_TYPE_REPOSITORY,
  type InstitutionAccountTypeRepositoryPort,
} from "../../institution-account-type/domain/ports/institution-account-type.repository.port";
import type { InstitutionRepositoryPort } from "../domain/ports/institution.repository.port";

function toContract(
  r: InstitutionRow,
  accountTypes: accounts.AccountType[],
): reference.Institution {
  return {
    id: r.id,
    countryId: r.countryId,
    kind: r.kind,
    code: r.code,
    name: r.name,
    legalName: r.legalName,
    category: r.category,
    brands: r.brands,
    notes: r.notes,
    retailFacing: r.retailFacing,
    accountTypes,
  };
}

/** Adapter (FR-011) — the only file in `reference` allowed to import
 * `FinancialInstitution` from `@prisma/client`. Global data, not user-scoped
 * (see `reference.module.ts`). The products each institution offers live in
 * their own table, so they are COMPOSED through that table's port rather than
 * joined with a Prisma `include`. */
@Injectable()
export class PrismaInstitutionRepository implements InstitutionRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INSTITUTION_ACCOUNT_TYPE_REPOSITORY)
    private readonly accountTypes: InstitutionAccountTypeRepositoryPort,
  ) {}

  async findAll(filters: reference.InstitutionFilters): Promise<reference.Institution[]> {
    const rows = await this.prisma.financialInstitution.findMany({
      where: {
        ...(filters.country ? { country: { alpha2: filters.country.toUpperCase() } } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.retailFacing ? { retailFacing: true } : {}),
      },
      orderBy: { name: "asc" },
    });

    // Permissive product filter: keep an institution that declares the type AND
    // any institution whose catalogue isn't seeded yet (see the port's doc).
    const matching = filters.accountType
      ? await this.accountTypes
          .catalogueFor(filters.accountType)
          .then(({ offering, catalogued }) =>
            rows.filter((r) => offering.has(r.id) || !catalogued.has(r.id)),
          )
      : rows;

    const byInstitution = await this.accountTypes.listByInstitutions(matching.map((r) => r.id));
    return matching.map((r) => toContract(r, byInstitution.get(r.id) ?? []));
  }
}
