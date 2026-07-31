import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CountryLookupPort } from "../domain/ports/country-lookup.port";

/** Adapter for the name-lookup slice of the `country` table. */
@Injectable()
export class PrismaCountryLookupRepository implements CountryLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async nameById(id: string): Promise<string | null> {
    const row = await this.prisma.country.findUnique({ where: { id }, select: { name: true } });
    return row?.name ?? null;
  }
}
