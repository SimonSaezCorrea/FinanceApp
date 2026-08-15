import type { reference } from "@finance/contracts";
import { describe, expect, it } from "vitest";

import { institutionOption } from "./institutionOption";

function institution(overrides: Partial<reference.Institution> = {}): reference.Institution {
  return {
    id: "i1",
    countryId: "cl",
    kind: "NON_BANK_ISSUER",
    code: "741",
    name: "Copec Pay",
    legalName: "Compañía Emisora de Medios de Pago Digitales S.A.",
    category: null,
    brands: [],
    notes: null,
    retailFacing: true,
    accountTypes: ["PREPAID"],
    ...overrides,
  };
}

describe("institutionOption", () => {
  it("labels the option with the commercial name, not the registered entity", () => {
    expect(institutionOption(institution()).label).toBe("Copec Pay");
  });

  it("keeps the legal name and every brand as search terms", () => {
    const option = institutionOption(
      institution({
        name: "BancoEstado",
        legalName: "Banco del Estado de Chile",
        brands: ["CuentaRUT"],
      }),
    );
    expect(option.keywords).toEqual(["Banco del Estado de Chile", "CuentaRUT"]);
  });

  it("drops a missing legal name instead of listing an empty term", () => {
    expect(institutionOption(institution({ legalName: null })).keywords).toEqual([]);
  });
});
