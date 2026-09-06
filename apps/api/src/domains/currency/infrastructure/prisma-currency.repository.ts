import { Injectable } from "@nestjs/common";
import type { Currency as CurrencyRow } from "@prisma/client";

import type { reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CurrencyRepositoryPort } from "../domain/ports/currency.repository.port";

function toContract(r: CurrencyRow): reference.Currency {
  return { id: r.id, code: r.code, numeric: r.numeric, name: r.name, symbol: r.symbol };
}

/** Adapter (FR-011) — the only file in `reference` allowed to import
 * `Currency` from `@prisma/client`. Global data, not user-scoped (see
 * `reference.module.ts`). */
@Injectable()
export class PrismaCurrencyRepository implements CurrencyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<reference.Currency[]> {
    const rows = await this.prisma.currency.findMany();
    // Postgres' default collation sorts bytes, not locale-aware — sort in JS
    // (localeCompare) so accented names order the way a Spanish-speaking user expects.
    return rows.map(toContract).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
}
