import { Injectable } from "@nestjs/common";
import type { Passkey as PasskeyRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { MarkedPasskey, PasskeyPlan, PasskeyProps } from "../domain/passkey.entity";
import type { PasskeyRepositoryPort } from "../domain/ports/passkey.repository.port";

function rowToProps(row: PasskeyRow): PasskeyProps {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    credentialId: row.credentialId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: row.transports,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    aaguid: row.aaguid,
    authenticatorName: row.authenticatorName,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    compromisedAt: row.compromisedAt ? row.compromisedAt.toISOString() : null,
    compromisedReason: row.compromisedReason,
  };
}

/** Adapter — the ONLY file that touches `prisma.passkey`. */
@Injectable()
export class PrismaPasskeyRepository implements PasskeyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createWithTx(tx: unknown, plan: PasskeyPlan): Promise<PasskeyProps> {
    const client = tx as PrismaService;
    const row = await client.passkey.create({ data: plan });
    return rowToProps(row);
  }

  async findByUserId(userId: string): Promise<PasskeyProps[]> {
    const rows = await this.prisma.passkey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToProps);
  }

  async findByCredentialId(credentialId: string): Promise<PasskeyProps | null> {
    const row = await this.prisma.passkey.findUnique({ where: { credentialId } });
    return row ? rowToProps(row) : null;
  }

  async findByIdOwned(userId: string, id: string): Promise<PasskeyProps | null> {
    const row = await this.prisma.passkey.findFirst({ where: { id, userId } });
    return row ? rowToProps(row) : null;
  }

  async updateCounterAndLastUsedWithTx(
    tx: unknown,
    id: string,
    counter: number,
    lastUsedAt: Date,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.passkey.update({ where: { id }, data: { counter, lastUsedAt } });
  }

  async deleteOwned(userId: string, id: string, tx?: unknown): Promise<boolean> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const result = await client.passkey.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async renameOwned(userId: string, id: string, name: string): Promise<PasskeyProps | null> {
    const result = await this.prisma.passkey.updateMany({ where: { id, userId }, data: { name } });
    if (result.count === 0) return null;
    const row = await this.prisma.passkey.findUniqueOrThrow({ where: { id } });
    return rowToProps(row);
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.passkey.deleteMany({ where: { userId } });
  }

  countUsable(userId: string): Promise<number> {
    return this.prisma.passkey.count({ where: { userId, compromisedAt: null } });
  }

  async markCompromisedWithTx(
    tx: unknown,
    reasonByAaguid: ReadonlyMap<string, string>,
    now: Date,
  ): Promise<MarkedPasskey[]> {
    const client = tx as PrismaService;
    const marked: MarkedPasskey[] = [];
    for (const [aaguid, reason] of reasonByAaguid) {
      // Conditional on still being unmarked: a concurrent or repeated review marks nothing twice.
      const rows = await client.$queryRaw<MarkedPasskey[]>`
        UPDATE "passkey" SET "compromisedAt" = ${now}, "compromisedReason" = ${reason}
        WHERE "aaguid" = ${aaguid} AND "verifiedAt" IS NOT NULL AND "compromisedAt" IS NULL
        RETURNING "id", "userId", "name"`;
      marked.push(...rows);
    }
    return marked;
  }
}
