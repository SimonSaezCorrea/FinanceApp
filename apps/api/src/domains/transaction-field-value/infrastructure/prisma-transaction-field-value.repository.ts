import { Injectable } from "@nestjs/common";
import { Prisma, type TransactionFieldValue as ValueRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  FieldType,
  FieldValue,
  FieldValuePredicate,
  FieldValueWrite,
  StoredFieldValue,
  TransactionFieldValueRepositoryPort,
} from "../domain/ports/transaction-field-value.repository.port";

type Columns = Pick<
  Prisma.TransactionFieldValueUncheckedCreateInput,
  "booleanValue" | "textValue" | "numberValue" | "dateValue" | "optionId"
>;

const EMPTY: Columns = {
  booleanValue: null,
  textValue: null,
  numberValue: null,
  dateValue: null,
  optionId: null,
};

/** The one column a value of this type lives in; the rest are null. */
function columnsFor(type: FieldType, value: FieldValue): Columns {
  switch (type) {
    case "BOOLEAN":
      return { ...EMPTY, booleanValue: value as boolean };
    case "TEXT":
      return { ...EMPTY, textValue: value as string };
    case "NUMBER":
      return { ...EMPTY, numberValue: new Prisma.Decimal(value as string) };
    case "DATE":
      return { ...EMPTY, dateValue: new Date(`${value as string}T00:00:00.000Z`) };
    case "OPTION":
      return { ...EMPTY, optionId: value as string };
  }
}

/** A `where` that matches rows holding exactly this value. */
function whereValue(type: FieldType, value: FieldValue): Prisma.TransactionFieldValueWhereInput {
  const columns = columnsFor(type, value);
  switch (type) {
    case "BOOLEAN":
      return { booleanValue: columns.booleanValue as boolean };
    case "TEXT":
      return { textValue: columns.textValue as string };
    case "NUMBER":
      return { numberValue: columns.numberValue as Prisma.Decimal };
    case "DATE":
      return { dateValue: columns.dateValue as Date };
    case "OPTION":
      return { optionId: columns.optionId as string };
  }
}

/** Whichever column is set, back as a contract value. */
function rowValue(row: Pick<ValueRow, keyof Columns>): FieldValue {
  if (row.booleanValue !== null) return row.booleanValue;
  if (row.numberValue !== null) return row.numberValue.toString();
  if (row.dateValue !== null) return row.dateValue.toISOString().slice(0, 10);
  if (row.optionId !== null) return row.optionId;
  return row.textValue ?? "";
}

/** `coverPreviousValue` is `{ type, value: <typed> | null }` — the type travels with
 * it so restoring never has to read the `custom-field` table (Principle VI). */
function previousOf(json: Prisma.JsonValue | null): { type: FieldType; value: FieldValue | null } {
  const stored = json as { type: FieldType; value?: FieldValue | null };
  return { type: stored.type, value: stored.value ?? null };
}

/**
 * Adapter — the only file that touches `prisma.transactionFieldValue` (specs/036).
 * Every query is scoped by `userId`. "No value" is no row.
 */
@Injectable()
export class PrismaTransactionFieldValueRepository implements TransactionFieldValueRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listForTransactions(
    userId: string,
    transactionIds: string[],
  ): Promise<Map<string, Record<string, FieldValue>>> {
    const result = new Map<string, Record<string, FieldValue>>();
    if (transactionIds.length === 0) return result;
    const rows = await this.prisma.transactionFieldValue.findMany({
      where: { userId, transactionId: { in: transactionIds } },
    });
    for (const row of rows) {
      const values = result.get(row.transactionId) ?? {};
      values[row.customFieldId] = rowValue(row);
      result.set(row.transactionId, values);
    }
    return result;
  }

  async countByField(userId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.transactionFieldValue.groupBy({
      by: ["customFieldId"],
      where: { userId },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.customFieldId, g._count._all]));
  }

  async usedOptionIds(userId: string, customFieldId: string): Promise<Set<string>> {
    const rows = await this.prisma.transactionFieldValue.findMany({
      where: { userId, customFieldId, optionId: { not: null } },
      distinct: ["optionId"],
      select: { optionId: true },
    });
    return new Set(rows.map((r) => r.optionId).filter((o): o is string => o !== null));
  }

  async idsMatching(
    userId: string,
    customFieldId: string,
    predicate: FieldValuePredicate,
  ): Promise<string[]> {
    const where: Prisma.TransactionFieldValueWhereInput = { userId, customFieldId };
    if (predicate.kind === "equals")
      Object.assign(where, whereValue(predicate.type, predicate.value));
    if (predicate.kind === "contains") {
      where.textValue = { contains: predicate.text, mode: "insensitive" };
    }
    if (predicate.kind === "range") {
      const bound = (v: string) =>
        predicate.type === "NUMBER" ? new Prisma.Decimal(v) : new Date(`${v}T00:00:00.000Z`);
      const range = {
        ...(predicate.min !== undefined ? { gte: bound(predicate.min) } : {}),
        ...(predicate.max !== undefined ? { lte: bound(predicate.max) } : {}),
      };
      if (predicate.type === "NUMBER") where.numberValue = range as Prisma.DecimalFilter;
      else where.dateValue = range as Prisma.DateTimeFilter;
    }
    const rows = await this.prisma.transactionFieldValue.findMany({
      where,
      select: { transactionId: true },
    });
    return rows.map((r) => r.transactionId);
  }

  async valuesFor(
    userId: string,
    customFieldId: string,
    transactionIds: string[],
    tx?: unknown,
  ): Promise<Map<string, StoredFieldValue>> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const rows = await client.transactionFieldValue.findMany({
      where: { userId, customFieldId, transactionId: { in: transactionIds } },
    });
    return new Map(
      rows.map((r) => [
        r.transactionId,
        { value: rowValue(r), coveredByTransferGroupId: r.coveredByTransferGroupId },
      ]),
    );
  }

  async upsertManyWithTx(tx: unknown, userId: string, writes: FieldValueWrite[]): Promise<void> {
    if (writes.length === 0) return;
    const client = tx as PrismaService;
    // Replace in set-based statements — one delete per field, one insert for all —
    // rather than an upsert per value: an import writes thousands at once. A fresh
    // row carries no cover reference, which is what any write by hand must do.
    const byField = new Map<string, string[]>();
    for (const w of writes) {
      byField.set(w.customFieldId, [...(byField.get(w.customFieldId) ?? []), w.transactionId]);
    }
    for (const [customFieldId, transactionIds] of byField) {
      await client.transactionFieldValue.deleteMany({
        where: { userId, customFieldId, transactionId: { in: transactionIds } },
      });
    }
    await client.transactionFieldValue.createMany({
      data: writes.map((w) => ({
        userId,
        transactionId: w.transactionId,
        customFieldId: w.customFieldId,
        ...columnsFor(w.type, w.value),
      })),
    });
  }

  async setManyWithTx(
    tx: unknown,
    userId: string,
    field: { id: string; type: FieldType },
    transactionIds: string[],
    value: FieldValue,
  ): Promise<void> {
    if (transactionIds.length === 0) return;
    const client = tx as PrismaService;
    const columns = columnsFor(field.type, value);
    // Replace, in two set-based statements rather than one upsert per movement: a
    // bulk assignment touches up to 5.000 rows.
    await client.transactionFieldValue.deleteMany({
      where: { userId, customFieldId: field.id, transactionId: { in: transactionIds } },
    });
    await client.transactionFieldValue.createMany({
      data: transactionIds.map((transactionId) => ({
        userId,
        transactionId,
        customFieldId: field.id,
        ...columns,
      })),
    });
  }

  async deleteManyWithTx(
    tx: unknown,
    userId: string,
    customFieldId: string,
    transactionIds: string[],
  ): Promise<void> {
    if (transactionIds.length === 0) return;
    const client = tx as PrismaService;
    await client.transactionFieldValue.deleteMany({
      where: { userId, customFieldId, transactionId: { in: transactionIds } },
    });
  }

  async revertIfUnchangedWithTx(
    tx: unknown,
    userId: string,
    field: { id: string; type: FieldType },
    applied: FieldValue | null,
    restore: { transactionId: string; value: FieldValue | null }[],
  ): Promise<{ restored: number; kept: number }> {
    const client = tx as PrismaService;
    const ids = restore.map((r) => r.transactionId);
    const current = await this.valuesFor(userId, field.id, ids, client);
    // Compare-and-set: anything else means the person changed it since — theirs wins.
    const due = restore.filter((r) => (current.get(r.transactionId)?.value ?? null) === applied);
    await this.deleteManyWithTx(
      client,
      userId,
      field.id,
      due.filter((r) => r.value === null).map((r) => r.transactionId),
    );
    await this.upsertManyWithTx(
      client,
      userId,
      due
        .filter((r) => r.value !== null)
        .map((r) => ({
          transactionId: r.transactionId,
          customFieldId: field.id,
          type: field.type,
          value: r.value as FieldValue,
        })),
    );
    return { restored: due.length, kept: restore.length - due.length };
  }

  async lockForCoverWithTx(
    tx: unknown,
    userId: string,
    customFieldId: string,
    transactionIds: string[],
  ): Promise<Map<string, StoredFieldValue>> {
    const client = tx as PrismaService;
    if (transactionIds.length === 0) return new Map();
    const rows = await client.$queryRaw<ValueRow[]>`
      SELECT * FROM "transaction-field-value"
       WHERE "userId" = ${userId}
         AND "customFieldId" = ${customFieldId}
         AND "transactionId" IN (${Prisma.join(transactionIds)})
       FOR UPDATE`;
    return new Map(
      rows.map((r) => [
        r.transactionId,
        {
          value: rowValue({
            ...r,
            numberValue: r.numberValue === null ? null : new Prisma.Decimal(r.numberValue),
          }),
          coveredByTransferGroupId: r.coveredByTransferGroupId,
        },
      ]),
    );
  }

  async coverWithTx(
    tx: unknown,
    userId: string,
    field: { id: string; type: FieldType },
    value: FieldValue,
    transferGroupId: string,
    entries: { transactionId: string; previous: FieldValue | null; existed: boolean }[],
  ): Promise<void> {
    const client = tx as PrismaService;
    const columns = columnsFor(field.type, value);
    // The existing rows are locked (`lockForCoverWithTx`): replace them, then insert
    // every row with its previous value. No `skipDuplicates`: a row another cover
    // inserted meanwhile must fail this transaction (unique key), not be overwritten.
    await this.deleteManyWithTx(
      client,
      userId,
      field.id,
      entries.filter((e) => e.existed).map((e) => e.transactionId),
    );
    await client.transactionFieldValue.createMany({
      data: entries.map((e) => ({
        userId,
        transactionId: e.transactionId,
        customFieldId: field.id,
        ...columns,
        coveredByTransferGroupId: transferGroupId,
        coverPreviousValue: { type: field.type, value: e.previous } as Prisma.InputJsonValue,
      })),
    });
  }

  async revertCoverWithTx(
    tx: unknown,
    userId: string,
    transferGroupIds: string[],
  ): Promise<number> {
    if (transferGroupIds.length === 0) return 0;
    const client = tx as PrismaService;
    const rows = await client.transactionFieldValue.findMany({
      where: { userId, coveredByTransferGroupId: { in: transferGroupIds } },
    });
    for (const row of rows) {
      const previous = previousOf(row.coverPreviousValue);
      if (previous.value === null) {
        await client.transactionFieldValue.delete({ where: { id: row.id } });
      } else {
        await client.transactionFieldValue.update({
          where: { id: row.id },
          data: {
            ...columnsFor(previous.type, previous.value),
            coveredByTransferGroupId: null,
            coverPreviousValue: Prisma.DbNull,
          },
        });
      }
    }
    return rows.length;
  }

  coveredCount(userId: string, transferGroupId: string): Promise<number> {
    return this.prisma.transactionFieldValue.count({
      where: { userId, coveredByTransferGroupId: transferGroupId },
    });
  }
}
