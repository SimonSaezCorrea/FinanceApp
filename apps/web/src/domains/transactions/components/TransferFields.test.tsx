import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import type { TransactionFormValue } from "./TransactionFormPanel";
import { TransferFields } from "./TransferFields";

vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: vi.fn() },
}));

const acc = (over: Record<string, unknown>) =>
  ({
    status: "ACTIVE",
    institutionName: null,
    institution: null,
    accountNumber: null,
    cards: [],
    ...over,
  }) as unknown as accounts.BankAccount;

const ACCOUNTS = [
  acc({ id: "clp", name: "Cuenta CLP", type: "CHECKING", currency: "CLP" }),
  acc({ id: "clp2", name: "Ahorro CLP", type: "SAVINGS", currency: "CLP" }),
  acc({ id: "usd", name: "Cuenta USD", type: "CHECKING", currency: "USD" }),
];

const BASE: TransactionFormValue = {
  mode: "TRANSFER",
  amount: "",
  currency: "USD",
  bankAccountId: "usd",
  toBankAccountId: "clp",
  amountIn: "",
  amountInEdited: false,
  prepayFromAccountId: "",
  cardId: "",
  financeCharge: false,
  categoryId: "",
  recurringExpenseId: "",
  description: "",
  observation: "",
  emisor: "",
  receptor: "",
  lugar: "",
  date: "2026-10-08",
};

const usd = (date: string, value: string, valueDate = date) => ({
  currency: "USD" as const,
  date,
  value,
  valueDate,
});

function Harness({ initial = {} }: Readonly<{ initial?: Partial<TransactionFormValue> }>) {
  const [value, setValue] = useState<TransactionFormValue>({ ...BASE, ...initial });
  return (
    <>
      <TransferFields
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        accounts={ACCOUNTS}
        selectable={ACCOUNTS}
      />
      <button onClick={() => setValue((v) => ({ ...v, amount: "250" }))}>set-amount-250</button>
      <button onClick={() => setValue((v) => ({ ...v, date: "2026-10-01" }))}>set-date-oct-1</button>
      <output data-testid="amount">{value.amount}</output>
      <output data-testid="amountIn">{value.amountIn}</output>
      <output data-testid="edited">{String(value.amountInEdited)}</output>
    </>
  );
}

function renderHarness(initial: Partial<TransactionFormValue> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <Harness initial={initial} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const destination = () => screen.getByLabelText("Monto que entra (CLP)") as HTMLInputElement;

describe("TransferFields — amount on the other side (spec 030)", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.mocked(exchangeRatesApi.list).mockReset();
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [usd("2026-10-08", "950"), usd("2026-10-01", "900")],
      latest: { USD: usd("2026-10-08", "950"), CLF: null },
    });
  });

  it("suggests the pesos for a USD origin, with the rate of the movement's date", async () => {
    renderHarness({ amount: "100" });

    await waitFor(() => expect(destination().value).toBe("95.000"));
    expect(screen.getByTestId("amountIn").textContent).toBe("95000");
    expect(screen.getByText(/Estimado con el dólar del/)).toBeDefined();
  });

  it("keeps suggesting while the destination is untouched: a new amount or date re-suggests", async () => {
    renderHarness({ amount: "100" });
    await waitFor(() => expect(destination().value).toBe("95.000"));

    fireEvent.click(screen.getByText("set-amount-250"));
    await waitFor(() => expect(destination().value).toBe("237.500"));

    fireEvent.click(screen.getByText("set-date-oct-1"));
    await waitFor(() => expect(destination().value).toBe("225.000"));
  });

  it("editing the destination freezes it and never changes the origin amount", async () => {
    renderHarness({ amount: "100" });
    await waitFor(() => expect(destination().value).toBe("95.000"));

    fireEvent.change(destination(), { target: { value: "96.000" } });
    fireEvent.click(screen.getByText("set-amount-250"));

    expect(screen.getByTestId("amountIn").textContent).toBe("96000");
    expect(screen.getByTestId("edited").textContent).toBe("true");
    expect(screen.getByTestId("amount").textContent).toBe("250");
  });

  it("offers to go back to the estimate once it was edited", async () => {
    renderHarness({ amount: "100" });
    await waitFor(() => expect(destination().value).toBe("95.000"));
    fireEvent.change(destination(), { target: { value: "96.000" } });

    fireEvent.click(screen.getByRole("button", { name: "Usar el estimado" }));

    await waitFor(() => expect(destination().value).toBe("95.000"));
    expect(screen.getByTestId("edited").textContent).toBe("false");
  });

  it("never overrides what a saved transfer already holds", async () => {
    renderHarness({ amount: "100", amountIn: "93000", amountInEdited: true });

    await waitFor(() => expect(destination().value).toBe("93.000"));
    await new Promise((r) => setTimeout(r, 30));
    expect(destination().value).toBe("93.000");
  });

  it("with no recorded rate leaves it empty and says so", async () => {
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({ items: [], latest: { USD: null, CLF: null } });
    renderHarness({ amount: "100" });

    expect(await screen.findByText(/No hay un valor del dólar registrado/)).toBeDefined();
    expect(destination().value).toBe("");
    expect(screen.getByTestId("amountIn").textContent).toBe("");
  });

  it("is not shown at all when both accounts share a currency", async () => {
    renderHarness({ currency: "CLP", bankAccountId: "clp", toBankAccountId: "clp2", amount: "5000" });

    await waitFor(() => expect(screen.getByLabelText("Cuenta de destino")).toBeDefined());
    expect(screen.queryByLabelText(/Monto que entra/)).toBeNull();
    expect(screen.getByTestId("amountIn").textContent).toBe("");
  });

  it("any other pair has the field but suggests nothing (only USD to CLP is estimated)", async () => {
    renderHarness({ currency: "CLP", bankAccountId: "clp", toBankAccountId: "usd", amount: "95000" });

    const field = (await screen.findByLabelText("Monto que entra (USD)")) as HTMLInputElement;
    await new Promise((r) => setTimeout(r, 30));
    expect(field.value).toBe("");
    expect(screen.queryByText(/Estimado con/)).toBeNull();
    expect(screen.queryByText(/No hay un valor del dólar/)).toBeNull();

    fireEvent.change(field, { target: { value: "100,5" } });
    expect(screen.getByTestId("amountIn").textContent).toBe("100.5");
  });
});
