import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaAuthenticatorModelRepository } from "../../../../../src/domains/authenticator-model/infrastructure/prisma-authenticator-model.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Integration (specs/041): the global FIDO catalog table against a real Postgres. */
describe("PrismaAuthenticatorModelRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaAuthenticatorModelRepository(prisma);
  const next = new Date(Date.now() + 30 * 86_400_000);
  const model = (aaguid: string, compromisedStatus: string | null = null) => ({
    aaguid,
    description: `Model ${aaguid}`,
    statement: { aaguid, description: `Model ${aaguid}` },
    compromisedStatus,
    statusDate: null,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.authenticatorModel.deleteMany({});
  });

  afterAll(async () => {
    await prisma.authenticatorModel.deleteMany({});
    await prisma.$disconnect();
  });

  it("replaces the whole set only with a greater catalog number", async () => {
    expect(
      await repo.replaceAll({ number: 10, nextUpdate: next, models: [model("a-1"), model("a-2")] }),
    ).toBe(true);
    expect(await repo.currentCatalog()).toEqual({ number: 10, nextUpdate: next });

    expect(await repo.replaceAll({ number: 10, nextUpdate: next, models: [model("a-3")] })).toBe(
      false,
    );
    expect(await repo.findByAaguid("a-3")).toBeNull();

    expect(
      await repo.replaceAll({
        number: 11,
        nextUpdate: next,
        models: [model("a-1"), model("a-4", "REVOKED")],
      }),
    ).toBe(true);
    expect(await repo.findByAaguid("a-2")).toBeNull();
    expect((await repo.findByAaguid("a-1"))?.description).toBe("Model a-1");
    expect(await repo.statements()).toHaveLength(2);
    expect(await repo.compromised()).toEqual(new Map([["a-4", "REVOKED"]]));
  });

  it("two concurrent replacements with the same number apply once", async () => {
    const results = await Promise.all([
      repo.replaceAll({ number: 12, nextUpdate: next, models: [model("b-1")] }),
      repo.replaceAll({ number: 12, nextUpdate: next, models: [model("b-2")] }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.authenticatorModel.count()).toBe(1);
  });
});
