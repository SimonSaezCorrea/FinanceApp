import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaCurrencyRepository } from "../../../../../src/domains/currency/infrastructure/prisma-currency.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires a reachable Postgres,
 * already seeded via `pnpm db:seed`. Not part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaCurrencyRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaCurrencyRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists currencies ordered by name", async () => {
    const currencies = await repo.findAll();
    expect(currencies.length).toBeGreaterThan(0);
    const names = currencies.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(currencies.some((c) => c.code === "CLP")).toBe(true);
  });
});
