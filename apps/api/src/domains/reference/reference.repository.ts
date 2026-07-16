import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** Global reference data (countries, banks, currencies). Not user-scoped. */
@Injectable()
export class ReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCountries() {
    return this.prisma.country.findMany({
      orderBy: { name: "asc" },
      include: { identifierTypes: { orderBy: { isPrimary: "desc" } } },
    });
  }

  listInstitutions(countryAlpha2?: string, kind?: "BANK" | "NON_BANK_ISSUER") {
    return this.prisma.financialInstitution.findMany({
      where: {
        ...(countryAlpha2 ? { country: { alpha2: countryAlpha2.toUpperCase() } } : {}),
        ...(kind ? { kind } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  listCurrencies() {
    return this.prisma.currency.findMany({ orderBy: { name: "asc" } });
  }
}
