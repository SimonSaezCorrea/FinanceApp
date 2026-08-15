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

    // Not every issuer is a prepaid one any more: the credit-only register (TCEEM)
    // is seeded too, so the flagship depends on the licence each entity holds.
    const issuers = await repo.findAll({ country: "CL", kind: "NON_BANK_ISSUER" });
    expect(
      issuers.every((i) => i.accountTypes[0] === "PREPAID" || i.accountTypes[0] === "CREDIT_LINE"),
    ).toBe(true);
  });

  it("labels institutions commercially and keeps the registered entity searchable", async () => {
    const issuers = await repo.findAll({ country: "CL", kind: "NON_BANK_ISSUER" });
    const tenpo = issuers.find((i) => i.code === "730");
    expect(tenpo?.name).toBe("Tenpo");
    expect(tenpo?.legalName).toBe("Tenpo Payments S.A.");
    // Every issuer declares what it sells; the licence it holds decides what that
    // is — prepaid, credit, or both for an entity registered in both registers.
    expect(issuers.every((i) => i.accountTypes.length > 0)).toBe(true);
    expect(issuers.find((i) => i.legalName === "Matic Kard S.A.")?.accountTypes).toEqual([
      "CREDIT_LINE",
    ]);
    expect(issuers.find((i) => i.code === "699")?.accountTypes).toEqual(["PREPAID", "CREDIT_LINE"]);
  });

  it("lists cooperatives as their own kind, savings first", async () => {
    const coops = await repo.findAll({ country: "CL", kind: "COOPERATIVE" });
    expect(coops.length).toBeGreaterThan(0);
    const coopeuch = coops.find((i) => i.code === "672");
    expect(coopeuch?.name).toBe("Coopeuch");
    expect(coopeuch?.accountTypes[0]).toBe("SAVINGS");
  });

  it("hides corporate-only entities when the picker asks for retail ones", async () => {
    const retail = await repo.findAll({ country: "CL", retailFacing: true });
    expect(retail.every((i) => i.retailFacing)).toBe(true);
    // A foreign branch (JP Morgan) stays in the catalogue but out of the picker.
    const all = await repo.findAll({ country: "CL" });
    expect(all.some((i) => i.code === "041")).toBe(true);
    expect(retail.some((i) => i.code === "041")).toBe(false);
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
