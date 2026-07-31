import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  CountryCurrencyRepositoryPort,
  CountryCurrencyRow,
} from "../domain/ports/country-currency.repository.port";

/** Adapter — the ONLY file that touches `prisma.countryCurrency`. */
@Injectable()
export class PrismaCountryCurrencyRepository implements CountryCurrencyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByCountry(countryId: string): Promise<CountryCurrencyRow[]> {
    const rows = await this.prisma.countryCurrency.findMany({
      where: { countryId },
      orderBy: { isPrimary: "desc" },
    });
    return rows.map((r) => ({
      countryId: r.countryId,
      currencyId: r.currencyId,
      isPrimary: r.isPrimary,
    }));
  }

  async primaryForCountry(countryId: string): Promise<CountryCurrencyRow | null> {
    const row = await this.prisma.countryCurrency.findFirst({
      where: { countryId, isPrimary: true },
    });
    return row
      ? { countryId: row.countryId, currencyId: row.currencyId, isPrimary: row.isPrimary }
      : null;
  }
}
