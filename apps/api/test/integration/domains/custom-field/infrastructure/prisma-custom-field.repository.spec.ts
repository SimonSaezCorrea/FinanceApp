import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CustomField } from "../../../../../src/domains/custom-field/domain/custom-field.aggregate";
import { CustomFieldNameTakenError } from "../../../../../src/domains/custom-field/domain/errors";
import { PrismaCustomFieldRepository } from "../../../../../src/domains/custom-field/infrastructure/prisma-custom-field.repository";
import { generateRowId } from "../../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Real-test-DB integration test (specs/036) — requires `DATABASE_URL`. */
describe("PrismaCustomFieldRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaCustomFieldRepository(prisma);
  const userId = generateRowId();
  const otherId = generateRowId();
  const accountA = generateRowId();
  const accountB = generateRowId();

  const plan = (name: string, accountIds: string[] = []) =>
    CustomField.planCreation(
      userId,
      {
        name,
        type: "BOOLEAN",
        options: [],
        scope: { movementKinds: ["EXPENSE"], accountIds, cardKinds: ["CREDIT"] },
        defaultValue: false,
      },
      0,
    );

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [userId, otherId]) {
      await prisma.user.create({
        data: { id, email: `${id}@test.local`, passwordHash: "x", name: "Test" },
      });
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("creates and reads back a field with its scope and default", async () => {
    const created = await repo.createWithTx(prisma, plan("Transferido"));
    const read = await repo.findOwned(userId, created.id);
    expect(read?.name).toBe("Transferido");
    expect(read?.defaultValue).toBe(false);
    expect(read?.scope).toEqual({
      movementKinds: ["EXPENSE"],
      restrictAccounts: false,
      accountIds: [],
      cardKinds: ["CREDIT"],
    });
  });

  it("refuses a name that differs only in case or accents", async () => {
    await expect(repo.createWithTx(prisma, plan("TRANSFERÍDO"))).rejects.toBeInstanceOf(
      CustomFieldNameTakenError,
    );
  });

  it("is invisible to another user", async () => {
    const [mine] = await repo.listForUser(userId);
    expect(await repo.findOwned(otherId, mine!.id)).toBeNull();
    expect(await repo.listForUser(otherId)).toEqual([]);
    expect(await repo.remove(otherId, mine!.id)).toBe(false);
  });

  it("an account leaving the scopes keeps the restriction (applies to nothing when empty)", async () => {
    const field = await repo.createWithTx(prisma, plan("Reembolsable", [accountA, accountB]));
    await repo.removeAccountFromScopesWithTx(prisma, userId, accountA);
    expect((await repo.findOwned(userId, field.id))!.scope.accountIds).toEqual([accountB]);
    await repo.removeAccountFromScopesWithTx(prisma, userId, accountB);
    const broken = (await repo.findOwned(userId, field.id))!;
    expect(broken.scope.accountIds).toEqual([]);
    expect(broken.scopeBroken).toBe(true);
  });

  it("clearing every account scope (REPLACE) leaves restricted fields broken", async () => {
    const field = await repo.createWithTx(prisma, plan("Viaje", [accountA]));
    await repo.clearAccountScopesWithTx(prisma, userId);
    expect((await repo.findOwned(userId, field.id))!.scopeBroken).toBe(true);
  });

  it("saves an update and deletes", async () => {
    const field = (await repo.listForUser(userId))[0]!;
    field.applyUpdate(
      { name: "Pagado a MACH", showAsColumn: true },
      { valueCount: 0, usedOptionIds: new Set() },
    );
    await repo.save(field);
    const read = (await repo.findOwned(userId, field.id))!;
    expect(read.name).toBe("Pagado a MACH");
    expect(read.showAsColumn).toBe(true);
    expect(await repo.remove(userId, field.id)).toBe(true);
    expect(await repo.findOwned(userId, field.id)).toBeNull();
    expect(randomUUID()).toBeTypeOf("string");
  });
});
