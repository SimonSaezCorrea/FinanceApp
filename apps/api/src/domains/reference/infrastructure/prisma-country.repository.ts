import { Injectable } from "@nestjs/common";
import type {
  Country as CountryRow,
  CountryIdentifierType,
} from "@prisma/client";

import type { reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CountryRepositoryPort } from "../domain/ports/country.repository.port";

function toContract(
  r: CountryRow & { identifierTypes: CountryIdentifierType[] },
): reference.Country {
  return {
    id: r.id,
    alpha2: r.alpha2,
    alpha3: r.alpha3,
    numeric: r.numeric,
    name: r.name,
    identifierTypes: r.identifierTypes.map((it) => it.identifierType),
    callingCode: r.callingCode,
  };
}

/** Adapter (FR-011) — the only file in `reference` allowed to import
 * `Country`/`CountryIdentifierType` from `@prisma/client`. Global data, not
 * user-scoped (see `reference.module.ts`). */
@Injectable()
export class PrismaCountryRepository implements CountryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<reference.Country[]> {
    const rows = await this.prisma.country.findMany({
      orderBy: { name: "asc" },
      include: { identifierTypes: { orderBy: { isPrimary: "desc" } } },
    });
    return rows.map(toContract);
  }
}
