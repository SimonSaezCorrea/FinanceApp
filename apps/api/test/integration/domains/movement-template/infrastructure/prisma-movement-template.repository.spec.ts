import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MovementTemplate } from "../../../../../src/domains/movement-template/domain/movement-template.aggregate";
import { MovementTemplateNameTakenError } from "../../../../../src/domains/movement-template/domain/errors";
import { PrismaMovementTemplateRepository } from "../../../../../src/domains/movement-template/infrastructure/prisma-movement-template.repository";
import { generateRowId } from "../../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Real-test-DB integration test (specs/037) — requires `DATABASE_URL`. */
describe("PrismaMovementTemplateRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaMovementTemplateRepository(prisma);
  const userId = generateRowId();
  const otherId = generateRowId();
  let accountId = "";
  let cardId = "";

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [userId, otherId]) {
      await prisma.user.create({
        data: { id, email: `${id}@test.local`, passwordHash: "x", name: "Test" },
      });
    }
    const account = await prisma.bankAccount.create({
      data: { userId, name: "Visa", type: "CREDIT_CARD", currency: "CLP" },
    });
    accountId = account.id;
    const card = await prisma.cardAccount.create({
      data: {
        accountId,
        userId,
        name: "Visa",
        kind: "CREDIT",
        last4: "1234",
        expiryMonth: 12,
        expiryYear: 2030,
      },
    });
    cardId = card.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("creates and reads back a template with its amount, references and values", async () => {
    const created = await repo.create(
      MovementTemplate.planCreation(
        userId,
        {
          name: "Arriendo mensual",
          type: "EXPENSE",
          amount: "450000",
          currency: "CLP",
          bankAccountId: accountId,
          cardId,
        },
        { "019a0000-0000-7000-8000-0000000000f1": true },
      ),
    );
    const read = await repo.findOwned(userId, created.id);
    const c = read!.toContract(new Set(["019a0000-0000-7000-8000-0000000000f1"]));
    expect(Number(c.amount)).toBe(450000);
    expect(c.cardId).toBe(cardId);
    expect(c.customFields).toEqual({ "019a0000-0000-7000-8000-0000000000f1": true });
  });

  it("refuses a name that differs only in case or accents, and hides it from others", async () => {
    await expect(
      repo.create(
        MovementTemplate.planCreation(userId, { name: "ARRIENDO Mensual", type: "EXPENSE" }, {}),
      ),
    ).rejects.toBeInstanceOf(MovementTemplateNameTakenError);
    const [mine] = await repo.listForUser(userId);
    expect(await repo.findOwned(otherId, mine!.id)).toBeNull();
    expect(await repo.remove(otherId, mine!.id)).toBe(false);
    expect(await repo.countForUser(userId)).toBe(1);
  });

  it("keeps the template when its card and then its account are deleted (SetNull)", async () => {
    await prisma.cardAccount.delete({ where: { id: cardId } });
    let [t] = await repo.listForUser(userId);
    expect(t!.toContract(new Set()).cardId).toBeNull();
    expect(t!.toContract(new Set()).bankAccountId).toBe(accountId);
    await prisma.bankAccount.delete({ where: { id: accountId } });
    [t] = await repo.listForUser(userId);
    expect(t!.toContract(new Set()).bankAccountId).toBeNull();
    expect(t!.toContract(new Set()).name).toBe("Arriendo mensual");
  });

  it("saves a replaced state and deletes", async () => {
    const [t] = await repo.listForUser(userId);
    t!.replace({ name: "Bencina", type: "EXPENSE" }, {});
    await repo.save(t!);
    expect((await repo.findOwned(userId, t!.id))!.toContract(new Set()).name).toBe("Bencina");
    expect(await repo.remove(userId, t!.id)).toBe(true);
    expect(await repo.listForUser(userId)).toEqual([]);
  });
});
