import { describe, expect, it, vi } from "vitest";

import { ListInstitutionsQueryHandler } from "../../../../../../src/domains/reference/application/queries/list-institutions.handler";
import { ListInstitutionsQuery } from "../../../../../../src/domains/reference/application/queries/list-institutions.query";
import type { InstitutionRepositoryPort } from "../../../../../../src/domains/reference/domain/ports/institution.repository.port";

describe("ListInstitutionsQueryHandler", () => {
  it("forwards the country/kind filters to the repository", async () => {
    const repo: InstitutionRepositoryPort = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: "i1",
          countryId: "c1",
          kind: "BANK",
          code: "001",
          name: "Banco de Chile",
          rut: null,
          category: "ESTABLISHED",
          brands: [],
          notes: null,
        },
      ]),
    };
    const handler = new ListInstitutionsQueryHandler(repo);

    const result = await handler.execute(
      new ListInstitutionsQuery({ country: "CL", kind: "BANK" }),
    );

    expect(repo.findAll).toHaveBeenCalledWith({ country: "CL", kind: "BANK" });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Banco de Chile");
  });

  it("passes empty filters through untouched", async () => {
    const repo: InstitutionRepositoryPort = { findAll: vi.fn().mockResolvedValue([]) };
    const handler = new ListInstitutionsQueryHandler(repo);

    await handler.execute(new ListInstitutionsQuery({}));

    expect(repo.findAll).toHaveBeenCalledWith({});
  });
});
