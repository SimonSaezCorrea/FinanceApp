import { Injectable } from "@nestjs/common";
import { Prisma, type IdempotencyRecord as IdempotencyRecordRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  IdempotencyRecord,
  type IdempotencyRecordProps,
  type PlannedIdempotencyRecord,
} from "../domain/idempotency-record.aggregate";
import type {
  IdempotencyRecordRepositoryPort,
  ReservationResult,
} from "../domain/ports/idempotency-record.repository.port";

function rowToProps(row: IdempotencyRecordRow): IdempotencyRecordProps {
  return {
    id: row.id,
    userId: row.userId,
    key: row.key,
    operation: row.operation,
    requestHash: row.requestHash,
    status: row.status,
    responseBody: row.responseBody ?? null,
    responseStatus: row.responseStatus,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/** Adapter (FR-011) — the ONLY file allowed to import `@prisma/client` for the
 * `idempotency-record` table. */
@Injectable()
export class PrismaIdempotencyRecordRepository implements IdempotencyRecordRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The unique violation is not an error condition here — it IS the concurrency
   * control. Two simultaneous callers issue this same INSERT; Postgres lets one
   * through and hands the other `P2002`, which we translate into "someone else
   * already owns this attempt". Translating it here keeps the Prisma error code
   * out of the application layer, as the repo's `EmailTakenError` already does.
   */
  async reserve(userId: string, plan: PlannedIdempotencyRecord): Promise<ReservationResult> {
    try {
      const row = await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key: plan.key,
          operation: plan.operation,
          requestHash: plan.requestHash,
          status: plan.status,
          responseBody: plan.responseBody as Prisma.InputJsonValue | undefined,
          responseStatus: plan.responseStatus,
          createdAt: plan.createdAt,
          expiresAt: plan.expiresAt,
        },
      });
      return { kind: "RESERVED", record: IdempotencyRecord.fromPersistence(rowToProps(row)) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.findByKey(userId, plan.key);
        // A row that vanished between the collision and this read (the cron, or
        // a release) means the attempt is free again — rethrow so the caller
        // retries rather than silently proceeding without a reservation.
        if (!existing) throw err;
        return { kind: "EXISTS", record: existing };
      }
      throw err;
    }
  }

  async findByKey(userId: string, key: string): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.idempotencyRecord.findFirst({ where: { userId, key } });
    return row ? IdempotencyRecord.fromPersistence(rowToProps(row)) : null;
  }

  /** Uses the CALLER's transaction on purpose: this write and the business
   * effect must commit together, or neither. */
  async completeWithTx(tx: unknown, id: string, body: unknown, status: number): Promise<void> {
    const client = tx as PrismaService;
    await client.idempotencyRecord.update({
      where: { id },
      data: {
        status: "COMPLETED",
        // `Prisma.JsonNull` writes an actual JSON null, not "leave the column
        // untouched" (what a bare `undefined` would mean to Prisma's `update`).
        // A void/204 result (e.g. paying an instalment) must still be written
        // explicitly, or a corrupt row (never completed) would be
        // indistinguishable from a legitimately empty one.
        responseBody: body === undefined ? Prisma.JsonNull : (body as Prisma.InputJsonValue),
        responseStatus: status,
      },
    });
  }

  async release(id: string): Promise<void> {
    // deleteMany, not delete: releasing an already-gone reservation is a no-op,
    // not a crash — this runs on the error path, where throwing again would
    // mask the real failure.
    await this.prisma.idempotencyRecord.deleteMany({ where: { id } });
  }

  async takeOver(id: string, plan: PlannedIdempotencyRecord): Promise<IdempotencyRecord> {
    const row = await this.prisma.idempotencyRecord.update({
      where: { id },
      data: {
        operation: plan.operation,
        requestHash: plan.requestHash,
        status: "IN_FLIGHT",
        responseBody: Prisma.DbNull,
        responseStatus: null,
        createdAt: plan.createdAt,
        expiresAt: plan.expiresAt,
      },
    });
    return IdempotencyRecord.fromPersistence(rowToProps(row));
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.prisma.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}
