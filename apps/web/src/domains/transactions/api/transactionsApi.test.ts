import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@finance/client";

import { transactionsApi } from "./transactionsApi";

vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  apiFetch: vi.fn().mockResolvedValue({}),
}));

const FIELD = "019a0000-0000-7000-8000-0000000000f1";

describe("transactionsApi query string", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends inScopeOf on its own and alongside a field filter", async () => {
    await transactionsApi.list({ inScopeOf: FIELD, limit: 20 });
    expect(vi.mocked(apiFetch)).toHaveBeenLastCalledWith(
      `/transactions?inScopeOf=${FIELD}&limit=20`,
    );
    await transactionsApi.summary({ cf: FIELD, cfv: "false", inScopeOf: FIELD });
    expect(vi.mocked(apiFetch)).toHaveBeenLastCalledWith(
      `/transactions/summary?cf=${FIELD}&cfv=false&inScopeOf=${FIELD}`,
    );
  });
});
