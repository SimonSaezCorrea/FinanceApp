import { Injectable } from "@nestjs/common";
import type { Category as CategoryRow } from "@prisma/client";

import type { reference } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CategoryLookupPort, CategoryRef } from "../domain/ports/category-lookup.port";
import type { CategoryRepositoryPort } from "../domain/ports/category.repository.port";

function toContract(r: CategoryRow): reference.Category {
  return { id: r.id, code: r.code, kind: r.kind, isSystem: r.isSystem, sortOrder: r.sortOrder };
}

/** Adapter (FR-011) — the only file allowed to query the `category` table. Serves
 * both the full catalogue and the narrow lookup other domains compose. */
@Injectable()
export class PrismaCategoryRepository implements CategoryRepositoryPort, CategoryLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<reference.Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    return rows.map(toContract);
  }

  async findById(id: string): Promise<CategoryRef | null> {
    return this.prisma.category.findUnique({
      where: { id },
      select: { id: true, code: true, kind: true, isSystem: true },
    });
  }

  async idForSystemCode(code: reference.SystemCategoryCode): Promise<string> {
    const row = await this.prisma.category.findUnique({ where: { code }, select: { id: true } });
    if (!row) throw new Error(`System category "${code}" is not seeded`);
    return row.id;
  }
}
