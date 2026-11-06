import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { generateRowId } from "../../../infra/id/generate-row-id";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  AuthenticatorCatalog,
  AuthenticatorModelProps,
  CatalogVersion,
} from "../domain/authenticator-model";
import type { AuthenticatorModelRepositoryPort } from "../domain/ports/authenticator-model.repository.port";

/** Adapter — the ONLY file that touches `prisma.authenticatorModel`. */
@Injectable()
export class PrismaAuthenticatorModelRepository implements AuthenticatorModelRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async currentCatalog(): Promise<CatalogVersion | null> {
    const row = await this.prisma.authenticatorModel.findFirst({
      orderBy: { catalogNumber: "desc" },
      select: { catalogNumber: true, catalogNextUpdate: true },
    });
    return row ? { number: row.catalogNumber, nextUpdate: row.catalogNextUpdate } : null;
  }

  async replaceAll(catalog: AuthenticatorCatalog): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes two replacements (two containers during a deploy): the second waits, then
      // sees the first's number and stops.
      await tx.$executeRaw`LOCK TABLE "authenticator-model" IN EXCLUSIVE MODE`;
      const current = await tx.authenticatorModel.aggregate({ _max: { catalogNumber: true } });
      const stored = current._max.catalogNumber;
      if (stored !== null && catalog.number <= stored) return false;
      const now = new Date();
      await tx.authenticatorModel.deleteMany({});
      await tx.authenticatorModel.createMany({
        data: catalog.models.map((m) => ({
          id: generateRowId(),
          aaguid: m.aaguid,
          description: m.description,
          statement: m.statement as Prisma.InputJsonValue,
          compromisedStatus: m.compromisedStatus,
          statusDate: m.statusDate,
          catalogNumber: catalog.number,
          catalogNextUpdate: catalog.nextUpdate,
          updatedAt: now,
        })),
        skipDuplicates: true,
      });
      return true;
    });
  }

  async findByAaguid(aaguid: string): Promise<AuthenticatorModelProps | null> {
    const row = await this.prisma.authenticatorModel.findUnique({ where: { aaguid } });
    return row
      ? {
          aaguid: row.aaguid,
          description: row.description,
          statement: row.statement,
          compromisedStatus: row.compromisedStatus,
          statusDate: row.statusDate,
        }
      : null;
  }

  async statements(): Promise<unknown[]> {
    const rows = await this.prisma.authenticatorModel.findMany({ select: { statement: true } });
    return rows.map((r) => r.statement);
  }

  async compromised(): Promise<Map<string, string>> {
    const rows = await this.prisma.authenticatorModel.findMany({
      where: { compromisedStatus: { not: null } },
      select: { aaguid: true, compromisedStatus: true },
    });
    return new Map(rows.map((r) => [r.aaguid, r.compromisedStatus!]));
  }
}
