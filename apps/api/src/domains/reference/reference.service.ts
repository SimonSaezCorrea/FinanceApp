import { Injectable } from "@nestjs/common";
import type {
  Country as CountryRow,
  Currency as CurrencyRow,
  FinancialInstitution as InstitutionRow,
} from "@prisma/client";

import { reference } from "@finance/contracts";

import { ReferenceRepository } from "./reference.repository";

@Injectable()
export class ReferenceService {
  constructor(private readonly repo: ReferenceRepository) {}

  async listCountries(): Promise<reference.Country[]> {
    return (await this.repo.listCountries()).map(countryToContract);
  }

  async listInstitutions(
    filters: reference.InstitutionFilters,
  ): Promise<reference.Institution[]> {
    return (await this.repo.listInstitutions(filters.country, filters.kind)).map(
      institutionToContract,
    );
  }

  async listCurrencies(): Promise<reference.Currency[]> {
    return (await this.repo.listCurrencies()).map(currencyToContract);
  }
}

function countryToContract(r: CountryRow): reference.Country {
  return { id: r.id, alpha2: r.alpha2, alpha3: r.alpha3, numeric: r.numeric, name: r.name };
}

function institutionToContract(r: InstitutionRow): reference.Institution {
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

function currencyToContract(r: CurrencyRow): reference.Currency {
  return { id: r.id, code: r.code, numeric: r.numeric, name: r.name };
}
