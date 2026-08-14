import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
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
});
