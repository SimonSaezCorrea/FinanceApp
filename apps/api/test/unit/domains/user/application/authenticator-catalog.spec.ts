import { describe, expect, it, vi } from "vitest";
import * as helpers from "@simplewebauthn/server/helpers";

import type { AuthenticatorModelRepositoryPort } from "../../../../../src/domains/authenticator-model/domain/ports/authenticator-model.repository.port";
import type { AuthenticatorCatalog as Catalog } from "../../../../../src/domains/authenticator-model/domain/authenticator-model";
import {
  AuthenticatorCatalog,
  toModels,
} from "../../../../../src/domains/user/application/authenticator-catalog";

function fakeRepo(stored: number | null = null) {
  let number = stored;
  const replaced: Catalog[] = [];
  const repo: AuthenticatorModelRepositoryPort = {
    currentCatalog: vi.fn(async () =>
      number === null ? null : { number, nextUpdate: new Date(Date.now() + 86_400_000) },
    ),
    replaceAll: vi.fn(async (catalog: Catalog) => {
      if (number !== null && catalog.number <= number) return false;
      number = catalog.number;
      replaced.push(catalog);
      return true;
    }),
    findByAaguid: vi.fn(async () => null),
    statements: vi.fn(async () => []),
    compromised: vi.fn(async () => new Map()),
  };
  return { repo, replaced };
}

class TestCatalog extends AuthenticatorCatalog {
  downloads = 0;
  constructor(
    repo: AuthenticatorModelRepositoryPort,
    private readonly payload: { no: number; entries: unknown[] },
    private readonly failVerify = false,
  ) {
    super(repo);
  }
  protected override async download(): Promise<string> {
    this.downloads += 1;
    return "blob";
  }
  protected override async verify() {
    if (this.failVerify) throw new Error("bad signature");
    return { payload: this.payload, parsedNextUpdate: new Date("2026-12-01T00:00:00Z") };
  }
}

const entry = (aaguid: string, statusReports: unknown[] = []) => ({
  aaguid,
  metadataStatement: { aaguid, description: `Model ${aaguid}` },
  statusReports,
});

describe("AuthenticatorCatalog (specs/041)", () => {
  it("the library still exposes what the catalog needs", () => {
    expect(typeof helpers.verifyMDSBlob).toBe("function");
    expect(typeof helpers.isoCBOR.decodeFirst).toBe("function");
    expect(typeof helpers.isoCBOR.encode).toBe("function");
  });

  it("keeps only FIDO2 entries with a statement, once, with their compromise status", () => {
    const models = toModels([
      entry("AA-1"),
      entry("aa-1"),
      { aaguid: "b-2" },
      { metadataStatement: { description: "U2F only" } } as never,
      entry("c-3", [{ status: "REVOKED", effectiveDate: "2025-01-01" }]),
    ] as never);
    expect(models.map((m) => m.aaguid)).toEqual(["aa-1", "c-3"]);
    expect(models[0]!.description).toBe("Model AA-1");
    expect(models[1]!.compromisedStatus).toBe("REVOKED");
  });

  it("stores a newer verified catalog", async () => {
    const { repo, replaced } = fakeRepo(5);
    const catalog = new TestCatalog(repo, { no: 6, entries: [entry("a-1")] });
    expect(await catalog.refresh()).toEqual({ replaced: true, number: 6, models: 1 });
    expect(replaced[0]!.nextUpdate.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("ignores a catalog that is not newer", async () => {
    const { repo } = fakeRepo(6);
    const catalog = new TestCatalog(repo, { no: 6, entries: [entry("a-1")] });
    expect(await catalog.refresh()).toEqual({ replaced: false, reason: "not-newer" });
  });

  it("a bad signature changes nothing", async () => {
    const { repo } = fakeRepo(5);
    const catalog = new TestCatalog(repo, { no: 9, entries: [] }, true);
    await expect(catalog.refresh()).rejects.toThrow("bad signature");
    expect(repo.replaceAll).not.toHaveBeenCalled();
  });

  it("at boot, downloads only when nothing is stored", async () => {
    const stored = new TestCatalog(fakeRepo(3).repo, { no: 4, entries: [] });
    expect(await stored.refresh({ onlyIfEmpty: true })).toEqual({
      replaced: false,
      reason: "skipped",
    });
    expect(stored.downloads).toBe(0);

    const empty = new TestCatalog(fakeRepo(null).repo, { no: 1, entries: [entry("a")] });
    expect((await empty.refresh({ onlyIfEmpty: true })).replaced).toBe(true);
  });

  it("reloads the library only when the stored catalog changed", async () => {
    const { repo } = fakeRepo(2);
    const catalog = new TestCatalog(repo, { no: 3, entries: [] });
    await catalog.load();
    await catalog.ensureLoaded();
    expect(repo.statements).toHaveBeenCalledTimes(1);
    await catalog.refresh();
    expect(repo.statements).toHaveBeenCalledTimes(2);
  });
});
