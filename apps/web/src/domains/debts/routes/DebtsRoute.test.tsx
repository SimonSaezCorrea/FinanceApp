import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { debts } from "@finance/contracts";

import i18n from "../../../i18n";
import { debtsApi } from "../api/debtsApi";
import { DebtsRoute } from "./DebtsRoute";
import { withPaidAmount } from "../testing/debtFixture";

vi.mock("../api/debtsApi", () => ({
  debtsApi: {
    list: vi.fn(),
    settle: vi.fn(),
    unsettle: vi.fn(),
    registerPayment: vi.fn(),
    undoPayment: vi.fn(),
    writeOff: vi.fn(),
    reinstate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

// jsdom has no real layout — `useElementWidth`'s `getBoundingClientRect` reads
// as 0, so the route always falls back to `DebtList` (the narrow-container
// rendering) in these tests. Every assertion below is written against
// behaviour both `DebtTable` and `DebtList` share (the row opens the same
// detail panel), so which one renders doesn't matter here.
vi.mock("../../accounts/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [
      {
        id: "acc1",
        name: "Cuenta Corriente",
        currency: "USD",
        currentBalance: "500000.0000",
      },
    ],
  }),
}));

vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { preferredCurrency: "USD", extraCurrencies: [] } }),
}));

function makeDebt(overrides: Partial<debts.Debt> = {}): debts.Debt {
  return withPaidAmount({
    id: "d1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1240.5000",
    currency: "USD",
    openedAt: "2026-01-01T00:00:00.000Z",
    dueAt: null,
    interestApr: null,
    title: null,
    notes: null,
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as debts.Debt);
}

function renderRoute(path = "/debts") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <DebtsRoute />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/**
 * `DebtList`'s row is now a `SwipeRow` — its tap is decided from a pointer
 * gesture with (near) zero horizontal travel, not a `click` (see
 * `swipe-row.test.tsx`'s own `drag` helper). jsdom's `PointerEvent` drops
 * `clientX`, so the sequence is dispatched as `MouseEvent`s the way that
 * suite does.
 */
function tapRow(text: HTMLElement) {
  const pointer = (target: HTMLElement | Document, type: string, clientX: number) =>
    fireEvent(target, new MouseEvent(type, { clientX, bubbles: true }));
  pointer(text, "pointerdown", 200);
  pointer(document, "pointerup", 200);
}

describe("DebtsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders debts returned by the API", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([makeDebt()]);

    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
  });

  it("shows the empty state when there are no debts", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([]);
    renderRoute();
    await waitFor(() => expect(screen.getByText(i18n.t("debts.empty"))).toBeDefined());
  });

  it("clicking a debt row opens its detail panel", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([makeDebt()]);
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
    tapRow(screen.getByText(/Acme Corp/));

    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());
  });

  it("a link with ?debt=<id> opens that debt's detail, even when the filter hides it", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([
      makeDebt({ id: "d2", counterparty: "Ximena", settledAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    renderRoute("/debts?debt=d2");

    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());
    expect(screen.getAllByText(/Ximena/).length).toBeGreaterThan(0);
  });

  it("opening Editar from the detail panel switches to the edit form", async () => {
    vi.mocked(debtsApi.list).mockResolvedValue([makeDebt()]);
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
    tapRow(screen.getByText(/Acme Corp/));
    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.edit") }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: i18n.t("common.saveChanges") })).toBeDefined(),
    );
  });

  it("pays a different amount than the instalment: what is typed is what is sent", async () => {
    const debt = makeDebt({ totalInstallments: 3, principal: "1200.0000" });
    vi.mocked(debtsApi.list).mockResolvedValue([debt]);
    vi.mocked(debtsApi.registerPayment).mockResolvedValue(debt);
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
    tapRow(screen.getByText(/Acme Corp/));
    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: i18n.t("debts.card.registerPayment") }));

    const input = await screen.findByLabelText(i18n.t("debts.pay.amount"));
    expect((input as HTMLInputElement).value).toBe("400");
    fireEvent.change(input, { target: { value: "399" } });
    expect(screen.getByText(/pendientes de esta cuota/)).toBeDefined();

    const submit = screen.getAllByRole("button", { name: i18n.t("debts.card.registerPayment") });
    fireEvent.click(submit[submit.length - 1]!);

    await waitFor(() =>
      expect(debtsApi.registerPayment).toHaveBeenCalledWith("d1", expect.any(String), {
        accountId: "acc1",
        amount: "399",
      }),
    );
  });

  it("closes a debt unpaid after confirming", async () => {
    const debt = makeDebt();
    vi.mocked(debtsApi.list).mockResolvedValue([debt]);
    vi.mocked(debtsApi.writeOff).mockResolvedValue({
      ...debt,
      writtenOffAt: "2026-03-01T00:00:00.000Z",
    });
    renderRoute();

    await waitFor(() => expect(screen.getByText(/Acme Corp/)).toBeDefined());
    tapRow(screen.getByText(/Acme Corp/));
    await waitFor(() => expect(screen.getByText(i18n.t("debts.detail.eyebrow"))).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: i18n.t("debts.writeOff.action.YOU_OWE") }));
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("debts.writeOff.confirm") }));

    await waitFor(() => expect(debtsApi.writeOff).toHaveBeenCalled());
    expect(vi.mocked(debtsApi.writeOff).mock.calls[0]![0]).toBe("d1");
  });
});
