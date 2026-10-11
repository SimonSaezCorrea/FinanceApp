import { Injectable } from "@nestjs/common";
import type { UserEmail as UserEmailRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { normalizeEmailAddress, type UserEmailProps } from "../domain/user-email.entity";
import type { UserEmailRepositoryPort } from "../domain/ports/user-email.repository.port";

function rowToProps(row: UserEmailRow): UserEmailProps {
  return {
    id: row.id,
    userId: row.userId,
    address: row.address,
    status: row.status,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    replacedAt: row.replacedAt,
  };
}

/** Adapter — the ONLY file that touches `prisma.userEmail`. */
@Injectable()
export class PrismaUserEmailRepository implements UserEmailRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<UserEmailProps[]> {
    const rows = await this.prisma.userEmail.findMany({ where: { userId } });
    return rows.map(rowToProps);
  }

  async findPrimary(userId: string): Promise<UserEmailProps | null> {
    const row = await this.prisma.userEmail.findFirst({ where: { userId, status: "PRIMARY" } });
    return row ? rowToProps(row) : null;
  }

  async findPending(userId: string): Promise<UserEmailProps | null> {
    const row = await this.prisma.userEmail.findFirst({ where: { userId, status: "PENDING" } });
    return row ? rowToProps(row) : null;
  }

  async findOwned(userId: string, id: string): Promise<UserEmailProps | null> {
    const row = await this.prisma.userEmail.findFirst({ where: { id, userId } });
    return row ? rowToProps(row) : null;
  }

  async findById(id: string): Promise<UserEmailProps | null> {
    const row = await this.prisma.userEmail.findUnique({ where: { id } });
    return row ? rowToProps(row) : null;
  }

  async createPrimaryWithTx(
    tx: unknown,
    userId: string,
    address: string,
    verifiedAt: Date | null,
  ): Promise<UserEmailProps> {
    const client = tx as PrismaService;
    const row = await client.userEmail.create({
      data: { userId, address: normalizeEmailAddress(address), status: "PRIMARY", verifiedAt },
    });
    return rowToProps(row);
  }

  async addPendingWithTx(
    tx: unknown,
    userId: string,
    address: string,
    now: Date,
  ): Promise<UserEmailProps> {
    const client = tx as PrismaService;
    await client.userEmail.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "PAST", replacedAt: now },
    });
    const row = await client.userEmail.create({
      data: { userId, address: normalizeEmailAddress(address), status: "PENDING" },
    });
    return rowToProps(row);
  }

  async findByIdWithTx(tx: unknown, id: string): Promise<UserEmailProps | null> {
    const row = await (tx as PrismaService).userEmail.findUnique({ where: { id } });
    return row ? rowToProps(row) : null;
  }

  async markVerifiedWithTx(tx: unknown, id: string, at: Date): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.userEmail.updateMany({
      where: { id, status: "PRIMARY", verifiedAt: null },
      data: { verifiedAt: at },
    });
    return result.count === 1;
  }

  async promotePendingWithTx(
    tx: unknown,
    userId: string,
    pendingId: string,
    at: Date,
  ): Promise<boolean> {
    const client = tx as PrismaService;
    await client.userEmail.updateMany({
      where: { userId, status: "PRIMARY" },
      data: { status: "PAST", replacedAt: at },
    });
    // Conditional: a pending row replaced or removed since the link was opened is not promoted.
    const promoted = await client.userEmail.updateMany({
      where: { id: pendingId, userId, status: "PENDING" },
      data: { status: "PRIMARY", verifiedAt: at },
    });
    return promoted.count === 1;
  }

  async removeOwned(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.userEmail.deleteMany({
      where: { id, userId, status: { not: "PRIMARY" } },
    });
    return result.count > 0;
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.userEmail.deleteMany({ where: { userId } });
  }
}
