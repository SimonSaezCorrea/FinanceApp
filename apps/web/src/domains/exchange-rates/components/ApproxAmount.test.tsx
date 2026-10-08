import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../api/exchangeRatesApi";
import { ApproxAmount } from "./ApproxAmount";

vi.mock("../api/exchangeRatesApi", () => ({ exchangeRatesApi: { list: vi.fn() } }));

let hideBalances = false;
vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { hideBalances } }),
}));

const usd = (date: string, value: string, valueDate = date) => ({
  currency: "USD" as const,
  date,
  value,
  valueDate,
});

function respondWith(latest: ReturnType<typeof usd> | null) {
  vi.mocked(exchangeRatesApi.list).mockResolvedValue({
    items: latest ? [latest] : [],
    latest: { USD: latest, CLF: null },
  });
}

function renderApprox(amount: string, currency: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ApproxAmount amount={amount} currency={currency} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("ApproxAmount", () => {
  beforeEach(() => {
    hideBalances = false;
    void i18n.changeLanguage("es");
    vi.mocked(exchangeRatesApi.list).mockReset();
  });

  it("shows the pesos a USD amount is worth, labelled as an estimate with the value's date", async () => {
    respondWith(usd("2026-10-08", "950"));
    renderApprox("1000.00", "USD");

    const hint = await screen.findByText(/≈ \$950\.000/);
    expect(hint.textContent).toContain("estimado");
    expect(hint.textContent).toContain("8 oct");
  });

  it("dates a carried rate with the day it was PUBLISHED, not the day it was filed under", async () => {
    respondWith(usd("2026-10-08", "950", "2026-10-05"));
    renderApprox("1000.00", "USD");

    const hint = await screen.findByText(/≈ \$950\.000/);
    expect(hint.textContent).toContain("5 oct");
  });

  it("keeps the sign of a debt", async () => {
    respondWith(usd("2026-10-08", "950"));
    renderApprox("-20.00", "USD");

    expect(await screen.findByText(/≈ −\$19\.000/)).toBeDefined();
  });

  it.each([["CLP"], ["CLF"], ["EUR"]])("renders nothing for %s", async (currency) => {
    respondWith(usd("2026-10-08", "950"));
    const { container } = renderApprox("1000", currency);

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("renders nothing when no rate is recorded (never an invented number)", async () => {
    respondWith(null);
    const { container } = renderApprox("1000.00", "USD");

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("is masked with the balance when 'ocultar saldos' is on, and revealed on demand", async () => {
    hideBalances = true;
    respondWith(usd("2026-10-08", "950"));
    renderApprox("1000.00", "USD");

    await waitFor(() => expect(screen.getByRole("button")).toBeDefined());
    expect(screen.queryByText(/\$950\.000/)).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/≈ \$950\.000/)).toBeDefined();
  });
});
