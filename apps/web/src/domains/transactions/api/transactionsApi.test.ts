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

describe("transactionsApi.list without a limit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("follows the cursor until the last page and joins the pages (security run-3)", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ items: [{ id: "a" }, { id: "b" }], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [{ id: "c" }], nextCursor: null });

    const page = await transactionsApi.list({ type: "EXPENSE" });

    expect(page).toEqual({ items: [{ id: "a" }, { id: "b" }, { id: "c" }], nextCursor: null });
    expect(vi.mocked(apiFetch).mock.calls.map(([url]) => url)).toEqual([
      "/transactions?type=EXPENSE",
      "/transactions?type=EXPENSE&cursor=c1",
    ]);
  });
});
