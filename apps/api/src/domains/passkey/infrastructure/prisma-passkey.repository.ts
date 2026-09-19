import { Injectable } from "@nestjs/common";
import type { Passkey as PasskeyRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { PasskeyPlan, PasskeyProps } from "../domain/passkey.entity";
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

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.passkey.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async renameOwned(userId: string, id: string, name: string): Promise<PasskeyProps | null> {
    const result = await this.prisma.passkey.updateMany({ where: { id, userId }, data: { name } });
    if (result.count === 0) return null;
    const row = await this.prisma.passkey.findUniqueOrThrow({ where: { id } });
    return rowToProps(row);
  }
}
