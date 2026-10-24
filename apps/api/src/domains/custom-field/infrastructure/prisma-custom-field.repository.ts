import { Injectable } from "@nestjs/common";
import { Prisma, type CustomField as CustomFieldRow } from "@prisma/client";

import type { customFields } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  CustomField,
  type CustomFieldValue,
  type PlannedCustomField,
} from "../domain/custom-field.aggregate";
import { CustomFieldNameTakenError } from "../domain/errors";
import type { CustomFieldRepositoryPort } from "../domain/ports/custom-field.repository.port";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function rowToField(row: CustomFieldRow): CustomField {
  const stored = row.defaultValue as { value?: CustomFieldValue } | null;
  return CustomField.fromPersistence({
    id: row.id,
    userId: row.userId,
    name: row.name,
    nameKey: row.nameKey,
    type: row.type,
    options: (row.options as customFields.CustomFieldOption[] | null) ?? [],
    scope: {
      movementKinds: row.scopeMovementKinds,
      restrictAccounts: row.scopeRestrictAccounts,
      accountIds: row.scopeAccountIds,
      cardKinds: row.scopeCardKinds,
    },
    defaultValue: stored && stored.value !== undefined ? stored.value : null,
    showAsColumn: row.showAsColumn,
    sortOrder: row.sortOrder,
  });
}

function toData(plan: PlannedCustomField) {
  return {
    name: plan.name,
    nameKey: plan.nameKey,
    type: plan.type,
    options: plan.options as unknown as Prisma.InputJsonValue,
    scopeMovementKinds: plan.scope.movementKinds,
    scopeRestrictAccounts: plan.scope.restrictAccounts,
    scopeAccountIds: plan.scope.accountIds,
    scopeCardKinds: plan.scope.cardKinds,
    defaultValue:
      plan.defaultValue === null
        ? Prisma.DbNull
        : ({ value: plan.defaultValue } as Prisma.InputJsonValue),
    showAsColumn: plan.showAsColumn,
    sortOrder: plan.sortOrder,
  };
}

/** Adapter — the only file that touches `prisma.customField`. Every access is scoped
 * by `userId` (Principle II). */
@Injectable()
export class PrismaCustomFieldRepository implements CustomFieldRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, tx?: unknown): Promise<CustomField[]> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const rows = await client.customField.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(rowToField);
  }

  async findOwned(userId: string, id: string, tx?: unknown): Promise<CustomField | null> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const row = await client.customField.findFirst({ where: { id, userId } });
    return row ? rowToField(row) : null;
  }

  countForUser(userId: string): Promise<number> {
    return this.prisma.customField.count({ where: { userId } });
  }

  async createWithTx(tx: unknown, plan: PlannedCustomField): Promise<CustomField> {
    const client = tx as PrismaService;
    try {
      const row = await client.customField.create({
        data: { userId: plan.userId, ...toData(plan) },
      });
      return rowToField(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new CustomFieldNameTakenError();
      throw err;
    }
  }

  async save(field: CustomField): Promise<void> {
    const props = field.toProps();
    try {
      await this.prisma.customField.update({
        where: { id: props.id, userId: props.userId },
        data: toData(props),
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new CustomFieldNameTakenError();
      throw err;
    }
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.customField.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async removeAccountFromScopesWithTx(
    tx: unknown,
    userId: string,
    accountId: string,
  ): Promise<void> {
    const client = tx as PrismaService;
    // `restrictAccounts` stays as it is: a scope that named only this account now
    // names none and applies to nothing, rather than turning into "every account".
    await client.$executeRaw`
      UPDATE "custom-field"
         SET "scopeAccountIds" = array_remove("scopeAccountIds", ${accountId}),
             "updatedAt" = NOW()
       WHERE "userId" = ${userId} AND ${accountId} = ANY("scopeAccountIds")`;
  }

  async clearAccountScopesWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.customField.updateMany({
      where: { userId, scopeRestrictAccounts: true },
      data: { scopeAccountIds: [] },
    });
  }
}
