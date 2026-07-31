import { Inject, Injectable } from "@nestjs/common";
import type { Country as CountryRow } from "@prisma/client";

import type { reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  COUNTRY_IDENTIFIER_TYPE_REPOSITORY,
  type CountryIdentifierTypeRepositoryPort,
} from "../../country-identifier-type/domain/ports/country-identifier-type.repository.port";
import type { CountryRepositoryPort } from "../domain/ports/country.repository.port";

function toContract(r: CountryRow, identifierTypes: reference.IdentifierType[]): reference.Country {
  return {
    id: r.id,
    alpha2: r.alpha2,
    alpha3: r.alpha3,
    numeric: r.numeric,
    name: r.name,
    identifierTypes,
    callingCode: r.callingCode,
  };
}

/**
 * Adapter — the ONLY file that touches `prisma.country`. Which identifier types
 * a country supports lives in its own table, read through that domain's port.
 * Global data, deliberately not user-scoped (see `country.module.ts`).
 */
@Injectable()
export class PrismaCountryRepository implements CountryRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(COUNTRY_IDENTIFIER_TYPE_REPOSITORY)
    private readonly identifierTypes: CountryIdentifierTypeRepositoryPort,
  ) {}

  async findAll(): Promise<reference.Country[]> {
    const rows = await this.prisma.country.findMany({ orderBy: { name: "asc" } });
    const types = await this.identifierTypes.listByCountries(rows.map((r) => r.id));
    return rows.map((r) => toContract(r, types.get(r.id) ?? []));
  }
}
