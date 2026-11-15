import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { Attachment, type AttachmentProps } from "../domain/attachment.aggregate";
import type {
  AttachmentRepositoryPort,
  AttachmentUsage,
} from "../domain/ports/attachment.repository.port";

type Row = {
  id: string;
  userId: string;
  transactionId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
};

const toAggregate = (row: Row): Attachment => Attachment.fromPersistence(row);

/** The ONLY adapter allowed to touch `transaction-attachment`. */
@Injectable()
export class PrismaAttachmentRepository implements AttachmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listForTransaction(userId: string, transactionId: string): Promise<Attachment[]> {
    const rows = await this.prisma.transactionAttachment.findMany({
      where: { userId, transactionId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toAggregate);
  }

  async findOne(
    userId: string,
    transactionId: string,
    attachmentId: string,
  ): Promise<Attachment | null> {
    const row = await this.prisma.transactionAttachment.findFirst({
      where: { id: attachmentId, userId, transactionId },
    });
    return row ? toAggregate(row) : null;
  }

  async save(props: Omit<AttachmentProps, "createdAt">): Promise<Attachment> {
    const row = await this.prisma.transactionAttachment.create({ data: props });
    return toAggregate(row);
  }

  async remove(userId: string, attachmentId: string): Promise<boolean> {
    const result = await this.prisma.transactionAttachment.deleteMany({
      where: { id: attachmentId, userId },
    });
    return result.count > 0;
  }

  async existingStorageKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.transactionAttachment.findMany({
      where: { storageKey: { in: keys } },
      select: { storageKey: true },
    });
    return new Set(rows.map((r) => r.storageKey));
  }

  async saveWithinQuota(
    props: Omit<AttachmentProps, "createdAt">,
    fits: (usage: AttachmentUsage) => boolean,
  ): Promise<Attachment | null> {
    return this.prisma.$transaction(async (tx) => {
      // One upload per person at a time: a transaction-scoped advisory lock keyed by the person,
      // so two uploads can't both count the usage before either inserts (no other table is read).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"attachment-quota:" + props.userId}))`;
      const usage = await this.usageWith(tx, props.userId, props.transactionId);
      if (!fits(usage)) return null;
      const row = await tx.transactionAttachment.create({ data: props });
      return toAggregate(row);
    });
  }

  usage(userId: string, transactionId: string): Promise<AttachmentUsage> {
    return this.usageWith(this.prisma, userId, transactionId);
  }

  private async usageWith(
    client: Pick<PrismaService, "transactionAttachment">,
    userId: string,
    transactionId: string,
  ): Promise<AttachmentUsage> {
    const [all, onMovement] = await Promise.all([
      client.transactionAttachment.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      client.transactionAttachment.count({ where: { userId, transactionId } }),
    ]);
    return {
      userCount: all._count._all,
      userBytes: all._sum.sizeBytes ?? 0,
      transactionCount: onMovement,
    };
  }
}
