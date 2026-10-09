import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts, transactions } from "@finance/contracts";

import i18n from "../../../i18n";
import { transactionsApi } from "../../transactions/api/transactionsApi";
import { StatementDetailPanel } from "./StatementDetailPanel";

vi.mock("../../transactions/api/transactionsApi", () => ({
  transactionsApi: { list: vi.fn(), summary: vi.fn() },
}));
vi.mock("../../installments/hooks/useInstallments", () => ({
  useInstallments: () => ({ data: [] }),
}));
// The table is its own concern: what matters here is which rows reach it.
vi.mock("../../transactions/components/TransactionTable", () => ({
  TransactionTable: ({ transactions: rows }: { transactions: { description: string }[] }) => (
    <ul>
      {rows.map((r) => (
        <li key={r.description}>{r.description}</li>
      ))}
    </ul>
  ),
}));

const account = {
  id: "a1",
  name: "BCI Crédito",
  currency: "CLP",
  cards: [],
} as unknown as accounts.BankAccount;

const statement = {
  id: "s1",
  accountId: "a1",
  status: "OPEN",
  periodStart: "2026-09-18T00:00:00.000Z",
  closedAt: null,
  paidAt: null,
  dueDate: null,
  nextClosingDate: null,
  amount: "1000",
  paidAmount: "0",
  carriedOverAmount: "0",
  prepaidAmount: "0",
  carriedToId: null,
  remainingAmount: "1000",
  minimumAmount: null,
  breakdown: { purchases: "1000", installments: "0", installmentCount: 0 },
  currency: "CLP",
  transferredAt: null,
  transferredAmount: null,
  transferredToId: null,
  canTransfer: false,
  transferReversal: null,
} as unknown as accounts.CreditStatement;

const page = (names: string[], nextCursor: string | null): transactions.TransactionPage =>
  ({ items: names.map((description) => ({ description })), nextCursor }) as never;

function renderPanel(onEditDates = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <StatementDetailPanel
            account={account}
            statement={statement}
            onOpenChange={vi.fn()}
            onEditDates={onEditDates}
          />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onEditDates };
}

describe("StatementDetailPanel — a period's movements, a page at a time", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.clearAllMocks();
    vi.mocked(transactionsApi.summary).mockResolvedValue({
      total: 3,
      currencyTotals: [],
      categoryIds: [],
    } as never);
  });

  it("loads the first page, then the next one on 'Mostrar más', and says how many are shown", async () => {
    vi.mocked(transactionsApi.list)
      .mockResolvedValueOnce(page(["Uno", "Dos"], "c1"))
      .mockResolvedValueOnce(page(["Tres"], null));
    renderPanel();

    expect(await screen.findByText("Uno")).toBeTruthy();
    expect(screen.queryByText("Tres")).toBeNull();
    expect(await screen.findByText("Mostrando 2 de 3")).toBeTruthy();
    // Always filtered by THIS period, a page at a time.
    expect(transactionsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ creditStatementId: "s1", limit: expect.any(Number) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mostrar más" }));
    expect(await screen.findByText("Tres")).toBeTruthy();
    // Nothing left: the button goes away.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mostrar más" })).toBeNull());
    expect(transactionsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "c1" }),
    );
  });

  it("offers no 'Mostrar más' when everything fits in one page", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue(page(["Uno"], null));
    renderPanel();
    expect(await screen.findByText("Uno")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mostrar más" })).toBeNull();
  });

  it("an open period offers 'Editar fechas' but not 'Generar facturación'", async () => {
    vi.mocked(transactionsApi.list).mockResolvedValue(page(["Uno"], null));
    const { onEditDates } = renderPanel();
    expect(await screen.findByText("Uno")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generar facturación" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar fechas" }));
    expect(onEditDates).toHaveBeenCalledWith(statement);
  });
});
