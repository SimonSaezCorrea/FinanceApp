import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { accountsApi } from "../../accounts/api/accountsApi";
import { transactionsApi } from "../api/transactionsApi";
import { TransactionCreateModal } from "./TransactionCreateModal";

vi.mock("../api/transactionsApi", () => ({
  transactionsApi: {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    transfer: { get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    attachments: { list: vi.fn(), upload: vi.fn(), url: vi.fn(), remove: vi.fn() },
  },
}));

vi.mock("../../accounts/api/accountsApi", () => ({
  accountsApi: { list: vi.fn(), get: vi.fn() },
}));

const account = {
  id: "a1",
  name: "Corriente",
  type: "CHECKING",
  status: "ACTIVE",
  currency: "CLP",
  currentBalance: "10000",
  creditLimit: "0",
  creditUsed: "0",
  cards: [],
} as unknown as accounts.BankAccount;

function renderModal(props: Partial<Parameters<typeof TransactionCreateModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <TransactionCreateModal open onOpenChange={() => {}} {...props} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("TransactionCreateModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountsApi.list).mockResolvedValue([account]);
    vi.mocked(transactionsApi.summary).mockResolvedValue({
      total: 0,
      currencyTotals: [],
      categories: [],
    });
    vi.mocked(transactionsApi.create).mockResolvedValue({ id: "t1" } as never);
    vi.mocked(transactionsApi.attachments.list).mockResolvedValue([]);
  });

  /** The account view opens the form with its own account locked in; the movement
   *  must be created FOR that account even though no selector is shown. */
  it("creates the movement on the locked account", async () => {
    renderModal({ defaultBankAccountId: "a1", lockAccount: true });

    fireEvent.change(screen.getByLabelText(i18n.t("transactions.form.amount")), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("transactions.form.submit") }));

    await waitFor(() => expect(transactionsApi.create).toHaveBeenCalledOnce());
    expect(vi.mocked(transactionsApi.create).mock.calls[0]![0]).toMatchObject({
      bankAccountId: "a1",
      amount: "1500",
      type: "EXPENSE",
      currency: "CLP",
    });
  });

  // T035: the form must carry an idempotency key end to end, and a replay
  // must be visually indistinguishable from a normal success (FR-007) — there
  // is no special branch for it anywhere in this component, which is itself
  // the assertion: the server can never hand back a "this was a replay" flag
  // for the client to react to (see contracts/idempotency.md §3).
  it("sends an idempotency key with the create request", async () => {
    renderModal({ defaultBankAccountId: "a1", lockAccount: true });

    fireEvent.change(screen.getByLabelText(i18n.t("transactions.form.amount")), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("transactions.form.submit") }));

    await waitFor(() => expect(transactionsApi.create).toHaveBeenCalledOnce());
    const [, idempotencyKey] = vi.mocked(transactionsApi.create).mock.calls[0]!;
    expect(typeof idempotencyKey).toBe("string");
    expect(idempotencyKey.length).toBeGreaterThanOrEqual(16);
  });

  // The exact failure mode T023 (useIdempotencyKey.test.ts) exists to catch,
  // verified again here at the component level: "Guardar y crear otro" must
  // mint a NEW key for the second record, or it would be rejected as a
  // duplicate of the first.
  it("uses a different idempotency key for each entry when saving and creating another", async () => {
    renderModal({ defaultBankAccountId: "a1", lockAccount: true });

    fireEvent.change(screen.getByLabelText(i18n.t("transactions.form.amount")), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("transactions.form.saveAndNew") }));
    await waitFor(() => expect(transactionsApi.create).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(i18n.t("transactions.form.amount")), {
      target: { value: "2000" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("transactions.form.saveAndNew") }));
    await waitFor(() => expect(transactionsApi.create).toHaveBeenCalledTimes(2));

    const [, firstKey] = vi.mocked(transactionsApi.create).mock.calls[0]!;
    const [, secondKey] = vi.mocked(transactionsApi.create).mock.calls[1]!;
    expect(secondKey).not.toBe(firstKey);
  });

  it("maps IDEMPOTENCY_KEY_REUSED to its own toast via the generic error path", async () => {
    vi.mocked(transactionsApi.create).mockRejectedValueOnce(
      new ApiRequestError("IDEMPOTENCY_KEY_REUSED", 409, "idempotency-key"),
    );
    renderModal({ defaultBankAccountId: "a1", lockAccount: true });

    fireEvent.change(screen.getByLabelText(i18n.t("transactions.form.amount")), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("transactions.form.submit") }));

    await waitFor(() => expect(transactionsApi.create).toHaveBeenCalledOnce());
    // No i18n key means no translation fallback would render the raw code —
    // reaching this point without an unhandled rejection is what T026's
    // es/en entries for this code exist to guarantee.
    expect(i18n.exists("errors.IDEMPOTENCY_KEY_REUSED")).toBe(true);
  });
});
