import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../api/exchangeRatesApi";
import { daysBefore, localDay } from "../lib/day";
import { ExchangeRatesRoute } from "./ExchangeRatesRoute";

vi.mock("../api/exchangeRatesApi", () => ({ exchangeRatesApi: { list: vi.fn() } }));

// The charts need a real layout engine; their data is what matters here.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const list = vi.mocked(exchangeRatesApi.list);
const TODAY = localDay();

const row = (currency: "USD" | "CLF", date: string, value: string, valueDate: string = date) => ({
  currency,
  date,
  value,
  valueDate,
});

function respond(items: ReturnType<typeof row>[]) {
  const latest = {
    USD: items.find((r) => r.currency === "USD") ?? null,
    CLF: items.find((r) => r.currency === "CLF") ?? null,
  };
  return { items, latest };
}

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ExchangeRatesRoute />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("ExchangeRatesRoute", () => {
  beforeEach(() => {
    list.mockReset();
    void i18n.changeLanguage("es");
  });

  it("shows today's dólar and UF with their value date, and marks the carried one", async () => {
    list.mockResolvedValue(
      respond([
        row("USD", TODAY, "979.85", daysBefore(TODAY, 2)),
        row("CLF", TODAY, "41122.74"),
        row("USD", daysBefore(TODAY, 1), "967.79"),
      ]),
    );

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Tipos de cambio" })).toBeDefined();
    const usd = await screen.findByTestId("rate-card-USD");
    expect(within(usd).getByText("$979,85")).toBeDefined();
    expect(within(usd).getByText("Dato arrastrado")).toBeDefined();
    const uf = screen.getByTestId("rate-card-CLF");
    expect(within(uf).getByText("$41.122,74")).toBeDefined();
    expect(within(uf).queryByText("Dato arrastrado")).toBeNull();
  });

  it("asks for the last 30 days by default and for a year when the range changes", async () => {
    list.mockResolvedValue(respond([row("USD", TODAY, "979.85"), row("CLF", TODAY, "41122.74")]));
    renderRoute();
    await screen.findByTestId("rate-card-USD");
    expect(list).toHaveBeenCalledWith({ from: daysBefore(TODAY, 29), to: TODAY });

    fireEvent.click(screen.getByRole("button", { name: "1 año" }));

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({ from: daysBefore(TODAY, 364), to: TODAY }),
    );
  });

  it("lists the days of the range in a table, marking carried values", async () => {
    list.mockResolvedValue(
      respond([
        row("USD", TODAY, "979.85"),
        row("CLF", TODAY, "41122.74"),
        row("USD", daysBefore(TODAY, 1), "967.79", daysBefore(TODAY, 3)),
        row("CLF", daysBefore(TODAY, 1), "41100"),
      ]),
    );

    renderRoute();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("$967,79")).toBeDefined();
    expect(within(table).getAllByText("arrastrado").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the value of a past date picked in the jump control, with its own one-day query", async () => {
    const now = new Date();
    const jump = localDay(new Date(now.getFullYear(), now.getMonth(), 15));
    list.mockImplementation(async (params) =>
      params?.from === jump && params?.to === jump
        ? respond([row("USD", jump, "901.5"), row("CLF", jump, "40000")])
        : respond([row("USD", TODAY, "979.85"), row("CLF", TODAY, "41122.74")]),
    );
    renderRoute();
    await screen.findByTestId("rate-card-USD");

    fireEvent.click(screen.getByLabelText("Ir a una fecha"));
    fireEvent.click(screen.getByRole("button", { name: "15" }));

    const picked = await screen.findByTestId("rate-on-date");
    expect(within(picked).getByText("$901,50")).toBeDefined();
    expect(within(picked).getByText("$40.000,00")).toBeDefined();
    expect(list).toHaveBeenCalledWith({ from: jump, to: jump });
  });

  it("says there is no data for a date before the first recorded value", async () => {
    list.mockImplementation(async (params) =>
      params?.from === params?.to
        ? { items: [], latest: { USD: null, CLF: null } }
        : respond([row("USD", TODAY, "979.85"), row("CLF", TODAY, "41122.74")]),
    );
    renderRoute();
    await screen.findByTestId("rate-card-USD");

    fireEvent.click(screen.getByLabelText("Ir a una fecha"));
    fireEvent.click(screen.getByRole("button", { name: "15" }));

    expect(await screen.findByText("Sin dato para esa fecha")).toBeDefined();
  });

  it("shows an empty state when nothing is recorded yet", async () => {
    list.mockResolvedValue({ items: [], latest: { USD: null, CLF: null } });

    renderRoute();

    expect(await screen.findByText("Aún no hay valores registrados.")).toBeDefined();
  });

  it("keeps the page header when the request fails", async () => {
    list.mockRejectedValue(new Error("boom"));

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Tipos de cambio" })).toBeDefined();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeDefined();
  });
});
