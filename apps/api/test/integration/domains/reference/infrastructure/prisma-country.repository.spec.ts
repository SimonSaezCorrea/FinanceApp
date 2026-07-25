import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaCountryRepository } from "../../../../../src/domains/reference/infrastructure/prisma-country.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres, already seeded via `pnpm db:seed` (reference data
 * is global/idempotently seeded, not created by this test). Not part of
 * `test:unit` (SC-002/SC-005).
 */
describe("PrismaCountryRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaCountryRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists countries ordered by name, with primary identifierType first", async () => {
    const countries = await repo.findAll();
    expect(countries.length).toBeGreaterThan(0);

    const names = countries.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const chile = countries.find((c) => c.alpha2 === "CL");
    expect(chile).toBeDefined();
    expect(chile!.identifierTypes[0]).toBe("RUT");
  });
});
