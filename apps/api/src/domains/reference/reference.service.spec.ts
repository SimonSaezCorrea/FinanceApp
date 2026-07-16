import { describe, expect, it, vi } from "vitest";

import { ReferenceService } from "./reference.service";
import type { ReferenceRepository } from "./reference.repository";

function makeService(repo: Partial<ReferenceRepository>) {
  return new ReferenceService(repo as ReferenceRepository);
}

describe("ReferenceService", () => {
  it("maps each country's identifierTypes relation to a flat, primary-first array", async () => {
    const svc = makeService({
      listCountries: vi.fn().mockResolvedValue([
        {
          id: "c1",
          alpha2: "CL",
          alpha3: "CHL",
          numeric: "152",
          name: "Chile",
          identifierTypes: [
            { id: "x1", countryId: "c1", identifierType: "RUT", isPrimary: true },
            { id: "x2", countryId: "c1", identifierType: "PASSPORT", isPrimary: false },
          ],
        },
      ]),
    });
    const countries = await svc.listCountries();
    expect(countries).toEqual([
      {
        id: "c1",
        alpha2: "CL",
        alpha3: "CHL",
        numeric: "152",
        name: "Chile",
        identifierTypes: ["RUT", "PASSPORT"],
      },
    ]);
  });

  it("returns an empty identifierTypes array for a country with none configured", async () => {
    const svc = makeService({
      listCountries: vi.fn().mockResolvedValue([
        { id: "c2", alpha2: "XX", alpha3: "XXX", numeric: "999", name: "Nowhere", identifierTypes: [] },
      ]),
    });
    const countries = await svc.listCountries();
    expect(countries[0]!.identifierTypes).toEqual([]);
  });
});
