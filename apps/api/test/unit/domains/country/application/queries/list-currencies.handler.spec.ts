import { describe, expect, it, vi } from "vitest";

import { ListCurrenciesQueryHandler } from "../../../../../../src/domains/currency/application/queries/list-currencies.handler";
import { ListCurrenciesQuery } from "../../../../../../src/domains/currency/application/queries/list-currencies.query";
import type { CurrencyRepositoryPort } from "../../../../../../src/domains/currency/domain/ports/currency.repository.port";

describe("ListCurrenciesQueryHandler", () => {
  it("returns whatever the repository resolves, unmodified", async () => {
    const repo: CurrencyRepositoryPort = {
      findAll: vi
        .fn()
        .mockResolvedValue([{ id: "cur1", code: "CLP", numeric: "152", name: "Chilean Peso", symbol: "$" }]),
    };
    const handler = new ListCurrenciesQueryHandler(repo);

    const result = await handler.execute(new ListCurrenciesQuery());

    expect(result).toEqual([{ id: "cur1", code: "CLP", numeric: "152", name: "Chilean Peso", symbol: "$" }]);
    expect(repo.findAll).toHaveBeenCalledOnce();
  });
});
