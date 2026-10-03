import { Injectable } from "@nestjs/common";
import type { ConsentRecord as ConsentRecordRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  ConsentRecordProps,
  ConsentType,
  GuardianAuthorizationPlan,
  GuardianRelationship,
} from "../domain/consent-record.entity";
import type { ConsentRecordRepositoryPort } from "../domain/ports/consent-record.repository.port";

function rowToProps(row: ConsentRecordRow): ConsentRecordProps {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as ConsentType,
    policyVersion: row.policyVersion,
    grantedAt: row.grantedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    guardianName: row.guardianName,
    guardianIdentifierHash: row.guardianIdentifierHash,
    guardianRelationship: row.guardianRelationship as GuardianRelationship | null,
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
    guardian?: GuardianAuthorizationPlan,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.consentRecord.create({
      data: {
        userId,
        type,
        policyVersion,
        guardianName: guardian?.guardianName ?? null,
        guardianIdentifierHash: guardian?.guardianIdentifierHash ?? null,
        guardianRelationship: guardian?.guardianRelationship ?? null,
      },
    });
  }

  async listByUser(userId: string): Promise<ConsentRecordProps[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map(rowToProps);
  }
}
