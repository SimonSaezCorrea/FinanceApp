import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { transactionsApi } from "../api/transactionsApi";
import { useInfiniteTransactions } from "./useTransactions";
import { useTransactionMutations } from "./useTransactionMutations";

vi.mock("../api/transactionsApi", () => ({
  transactionsApi: {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const page = (ids: string[]) => ({
  items: ids.map((id) => ({ id }) as never),
  nextCursor: null,
});

describe("useTransactionMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * The account view's movements table is an INFINITE query with its own filters
   * (`["transactions", "infinite", {bankAccountId}]`). Creating a movement has to
   * refetch it, or the row the user just added is missing from the very list they
   * added it in.
   */
  it("refetches an account-scoped infinite list after a create", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    vi.mocked(transactionsApi.list).mockResolvedValue(page(["t1"]));
    vi.mocked(transactionsApi.create).mockResolvedValue({ id: "t2" } as never);

    const { result } = renderHook(
      () => ({
        list: useInfiniteTransactions({ bankAccountId: "a1" }),
        mutations: useTransactionMutations(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.data?.pages[0]?.items).toHaveLength(1));

    vi.mocked(transactionsApi.list).mockResolvedValue(page(["t2", "t1"]));
    result.current.mutations.create.mutate({ amount: "1" } as never);

    await waitFor(() => expect(result.current.list.data?.pages[0]?.items).toHaveLength(2));
  });
});
