import { Injectable } from "@nestjs/common";
import type { ConsentRecord as ConsentRecordRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { ConsentRecordProps, ConsentType } from "../domain/consent-record.entity";
import type { ConsentRecordRepositoryPort } from "../domain/ports/consent-record.repository.port";

function rowToProps(row: ConsentRecordRow): ConsentRecordProps {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as ConsentType,
    policyVersion: row.policyVersion,
    grantedAt: row.grantedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

/** Adapter — the ONLY file that touches `prisma.consentRecord`. */
@Injectable()
export class PrismaConsentRecordRepository implements ConsentRecordRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createWithTx(
    tx: unknown,
    userId: string,
    type: ConsentType,
    policyVersion: string,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.consentRecord.create({ data: { userId, type, policyVersion } });
  }

  async listByUser(userId: string): Promise<ConsentRecordProps[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map(rowToProps);
  }
}
