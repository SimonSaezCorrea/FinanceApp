import { Injectable } from "@nestjs/common";
import { Prisma, type MovementTemplate as MovementTemplateRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  MovementTemplate,
  type MovementTemplateState,
  type PlannedMovementTemplate,
  type TemplateFieldValue,
} from "../domain/movement-template.aggregate";
import { MovementTemplateNameTakenError } from "../domain/errors";
import type { MovementTemplateRepositoryPort } from "../domain/ports/movement-template.repository.port";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function rowToTemplate(row: MovementTemplateRow): MovementTemplate {
  const stored = row.customFieldValues as Record<string, TemplateFieldValue> | null;
  return MovementTemplate.fromPersistence({
    id: row.id,
    userId: row.userId,
    name: row.name,
    nameKey: row.nameKey,
    type: row.type,
    amount: row.amount === null ? null : row.amount.toString(),
    currency: row.currency,
    bankAccountId: row.bankAccountId,
    cardId: row.cardId,
    categoryId: row.categoryId,
    recurringExpenseId: row.recurringExpenseId,
    description: row.description,
    observation: row.observation,
    emisor: row.emisor,
    receptor: row.receptor,
    lugar: row.lugar,
    financeCharge: row.financeCharge,
    customFieldValues: stored && typeof stored === "object" ? stored : {},
  });
}

function toData(state: MovementTemplateState) {
  return {
    name: state.name,
    nameKey: state.nameKey,
    type: state.type,
    amount: state.amount === null ? null : new Prisma.Decimal(state.amount),
    currency: state.currency,
    bankAccountId: state.bankAccountId,
    cardId: state.cardId,
    categoryId: state.categoryId,
    recurringExpenseId: state.recurringExpenseId,
    description: state.description,
    observation: state.observation,
    emisor: state.emisor,
    receptor: state.receptor,
    lugar: state.lugar,
    financeCharge: state.financeCharge,
    customFieldValues: state.customFieldValues as Prisma.InputJsonValue,
  };
}

/** Adapter — the only file that touches `prisma.movementTemplate`. Every access is
 * scoped by `userId` (Principle II). */
@Injectable()
export class PrismaMovementTemplateRepository implements MovementTemplateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<MovementTemplate[]> {
    const rows = await this.prisma.movementTemplate.findMany({
      where: { userId },
      orderBy: [{ nameKey: "asc" }, { id: "asc" }],
    });
    return rows.map(rowToTemplate);
  }

  async findOwned(userId: string, id: string): Promise<MovementTemplate | null> {
    const row = await this.prisma.movementTemplate.findFirst({ where: { id, userId } });
    return row ? rowToTemplate(row) : null;
  }

  countForUser(userId: string): Promise<number> {
    return this.prisma.movementTemplate.count({ where: { userId } });
  }

  async create(plan: PlannedMovementTemplate): Promise<MovementTemplate> {
    try {
      const row = await this.prisma.movementTemplate.create({
        data: { userId: plan.userId, ...toData(plan) },
      });
      return rowToTemplate(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new MovementTemplateNameTakenError();
      throw err;
    }
  }

  async save(template: MovementTemplate): Promise<void> {
    const props = template.toProps();
    try {
      await this.prisma.movementTemplate.update({
        where: { id: props.id, userId: props.userId },
        data: toData(props),
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new MovementTemplateNameTakenError();
      throw err;
    }
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.movementTemplate.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
