import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/** The backfill block of the `account_credit_limits` migration (between its markers), split
 * into statements — so the test runs exactly what the migration ran. */
function backfillStatements(): string[] {
  const dir = join(__dirname, "../../../../prisma/migrations");
  const folder = readdirSync(dir).find((d) => d.endsWith("_account_credit_limits"))!;
  const sql = readFileSync(join(dir, folder, "migration.sql"), "utf8");
  const block = sql.slice(sql.indexOf("-- backfill:start"), sql.indexOf("-- backfill:end"));
  return block
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

class Rollback extends Error {}

describe("account_credit_limits migration backfill (integration, spec 039)", () => {
  const prisma = new PrismaService(new ConfigService());
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it("sums each currency's independent limits into the account's credit, keeping sub-limits", async () => {
    const userId = `u_${randomUUID()}`;
    let seen: { currency: string; limitAmount: string; usedInitial: string; id: string }[] = [];
    let subLimit: string | null = null;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "T" },
        });
        const account = await tx.bankAccount.create({
          data: { userId, name: "Visa", type: "CREDIT_CARD", currency: "CLP" },
        });
        const make = (last4: string, isPrimary: boolean) =>
          tx.cardAccount.create({
            data: {
              accountId: account.id,
              userId,
              name: last4,
              kind: "CREDIT",
              last4,
              expiryMonth: 1,
              expiryYear: 2031,
              isPrimary,
            },
          });
        const primary = await make("1111", true);
        const additional = await make("2222", false);
        await tx.cardLimit.create({
          data: { cardId: primary.id, currency: "USD", limitAmount: "1000", usedInitial: "100" },
        });
        await tx.cardLimit.create({
          data: { cardId: additional.id, currency: "USD", limitAmount: "300", usedInitial: "50" },
        });

        for (const statement of backfillStatements()) await tx.$executeRawUnsafe(statement);

        seen = (await tx.accountCreditLimit.findMany({ where: { accountId: account.id } })).map(
          (l) => ({
            id: l.id,
            currency: l.currency,
            limitAmount: l.limitAmount.toString(),
            usedInitial: l.usedInitial.toString(),
          }),
        );
        subLimit =
          (
            await tx.cardLimit.findFirst({ where: { cardId: additional.id } })
          )?.limitAmount.toString() ?? null;
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ currency: "USD", limitAmount: "1300", usedInitial: "150" });
    expect(z.uuidv7().safeParse(seen[0]!.id).success).toBe(true);
    expect(subLimit).toBe("300");
  });
});
