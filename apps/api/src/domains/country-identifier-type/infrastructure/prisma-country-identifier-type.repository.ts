import { Injectable } from "@nestjs/common";

import type { reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CountryIdentifierTypeRepositoryPort } from "../domain/ports/country-identifier-type.repository.port";

/** Adapter — the ONLY file that touches `prisma.countryIdentifierType`. */
@Injectable()
export class PrismaCountryIdentifierTypeRepository implements CountryIdentifierTypeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByCountries(countryIds: string[]): Promise<Map<string, reference.IdentifierType[]>> {
    if (countryIds.length === 0) return new Map();
    const rows = await this.prisma.countryIdentifierType.findMany({
      where: { countryId: { in: countryIds } },
      orderBy: { isPrimary: "desc" },
    });
    const byCountry = new Map<string, reference.IdentifierType[]>();
    for (const row of rows) {
      const bucket = byCountry.get(row.countryId) ?? [];
      bucket.push(row.identifierType);
      byCountry.set(row.countryId, bucket);
    }
    return byCountry;
  }
}
