import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { Attachment, type AttachmentProps } from "../domain/attachment.aggregate";
import type { AttachmentRepositoryPort } from "../domain/ports/attachment.repository.port";

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
}
