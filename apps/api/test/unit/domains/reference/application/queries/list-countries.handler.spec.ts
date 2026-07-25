import { describe, expect, it, vi } from "vitest";

import { ListCountriesQueryHandler } from "../../../../../../src/domains/reference/application/queries/list-countries.handler";
import { ListCountriesQuery } from "../../../../../../src/domains/reference/application/queries/list-countries.query";
import type { CountryRepositoryPort } from "../../../../../../src/domains/reference/domain/ports/country.repository.port";

describe("ListCountriesQueryHandler", () => {
  it("returns whatever the repository resolves, unmodified", async () => {
    const repo: CountryRepositoryPort = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: "c1",
          alpha2: "CL",
          alpha3: "CHL",
          numeric: "152",
          name: "Chile",
          identifierTypes: ["RUT", "PASSPORT"],
          callingCode: "+56",
        },
      ]),
    };
    const handler = new ListCountriesQueryHandler(repo);

    const result = await handler.execute(new ListCountriesQuery());

    expect(result).toEqual([
      {
        id: "c1",
        alpha2: "CL",
        alpha3: "CHL",
        numeric: "152",
        name: "Chile",
        identifierTypes: ["RUT", "PASSPORT"],
        callingCode: "+56",
      },
    ]);
    expect(repo.findAll).toHaveBeenCalledOnce();
  });
});
