import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  PendingStorageDeletion,
  StorageDeletionRepositoryPort,
} from "../domain/ports/storage-deletion.repository.port";

/** The only adapter that queries the `storage-deletion` table (Principle VI). */
@Injectable()
export class PrismaStorageDeletionRepository implements StorageDeletionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listPending(limit: number): Promise<PendingStorageDeletion[]> {
    return this.prisma.storageDeletion.findMany({
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, storageKey: true, attempts: true },
    });
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.storageDeletion.deleteMany({ where: { id: { in: ids } } });
  }

  async recordFailure(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.storageDeletion.updateMany({
      where: { id: { in: ids } },
      data: { attempts: { increment: 1 } },
    });
  }
}
