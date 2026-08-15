import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaInstitutionRepository } from "../../../../../src/domains/financial-institution/infrastructure/prisma-institution.repository";
import { PrismaInstitutionAccountTypeRepository } from "../../../../../src/domains/institution-account-type/infrastructure/prisma-institution-account-type.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires a reachable Postgres,
 * already seeded via `pnpm db:seed`. Not part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaInstitutionRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaInstitutionRepository(
    prisma,
    new PrismaInstitutionAccountTypeRepository(prisma),
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("filters by country alpha-2 (case-insensitive)", async () => {
    const all = await repo.findAll({});
    expect(all.length).toBeGreaterThan(0);

    const cl = await repo.findAll({ country: "cl" });
    expect(cl.length).toBeGreaterThan(0);
    expect(cl.length).toBeLessThanOrEqual(all.length);
  });

  it("filters by kind", async () => {
    const banks = await repo.findAll({ kind: "BANK" });
    expect(banks.length).toBeGreaterThan(0);
    expect(banks.every((i) => i.kind === "BANK")).toBe(true);

    const issuers = await repo.findAll({ kind: "NON_BANK_ISSUER" });
    expect(issuers.length).toBeGreaterThan(0);
    expect(issuers.every((i) => i.kind === "NON_BANK_ISSUER")).toBe(true);
  });

  it("combines country and kind filters", async () => {
    const result = await repo.findAll({ country: "CL", kind: "BANK" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("exposes the products each institution offers, flagship first", async () => {
    const banks = await repo.findAll({ country: "CL", kind: "BANK" });
    expect(banks.every((i) => i.accountTypes.length > 0)).toBe(true);

    const issuers = await repo.findAll({ country: "CL", kind: "NON_BANK_ISSUER" });
    expect(issuers.every((i) => i.accountTypes[0] === "PREPAID")).toBe(true);
  });

  it("filters by account type, keeping institutions with no catalogued products", async () => {
    const prepaid = await repo.findAll({ country: "CL", accountType: "PREPAID" });
    expect(prepaid.length).toBeGreaterThan(0);
    // Either it offers prepaid, or its catalogue is unknown (permissive filter).
    expect(
      prepaid.every((i) => i.accountTypes.length === 0 || i.accountTypes.includes("PREPAID")),
    ).toBe(true);
    // A product no issuer sells narrows the list.
    const savings = await repo.findAll({ country: "CL", accountType: "SAVINGS" });
    expect(savings.length).toBeLessThan((await repo.findAll({ country: "CL" })).length);
  });
});
