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

function renderRoute(path = "/exchange-rates") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
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

  /** Answers each request with the rows of the currency it asks for, as the API does. */
  function respondByCurrency(items: ReturnType<typeof row>[]) {
    list.mockImplementation(async (params) =>
      respond(items.filter((r) => !params?.currency || r.currency === params.currency)),
    );
  }

  it("shows one currency at a time; on a narrow screen its title unfolds the picker", async () => {
    respondByCurrency([
      row("USD", TODAY, "979.85", daysBefore(TODAY, 2)),
      row("USD", daysBefore(TODAY, 1), "967.79"),
      row("CLF", TODAY, "41122.74"),
    ]);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Tipos de cambio" })).toBeDefined();
    const usd = await screen.findByTestId("rate-card-USD");
    expect(within(usd).getByTestId("rate-now").textContent).toBe("$979,85");
    expect(within(usd).getByText("Dato arrastrado")).toBeDefined();
    expect(screen.queryByTestId("rate-card-CLF")).toBeNull();

    const title = screen.getByRole("button", { name: /Cambiar moneda \(ahora Dólar observado\)/ });
    expect(title.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(title);
    const menu = screen.getByRole("navigation", { name: "Moneda" });
    // Each currency shows its value today, read from a short window of all of them.
    await within(menu).findByText("$41.122,74");
    fireEvent.click(within(menu).getByRole("button", { name: /UF/ }));

    const uf = await screen.findByTestId("rate-card-CLF");
    expect(within(uf).getByTestId("rate-now").textContent).toBe("$41.122,74");
    expect(within(uf).queryByText("Dato arrastrado")).toBeNull();
    expect(screen.queryByTestId("rate-card-USD")).toBeNull();
    expect(list).toHaveBeenCalledWith({ currency: "CLF", from: daysBefore(TODAY, 29), to: TODAY });
    expect(screen.queryByRole("navigation", { name: "Moneda" })).toBeNull(); // closes on pick
  });

  it("shows the currency rail beside the detail when there is room", async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);
    respondByCurrency([
      row("USD", TODAY, "979.85"),
      row("USD", daysBefore(TODAY, 1), "967.79"),
      row("CLF", TODAY, "41122.74"),
    ]);

    renderRoute();

    const rail = await screen.findByRole("navigation", { name: "Moneda" });
    expect(await within(rail).findByText("+$12,06")).toBeDefined(); // change since the day before
    expect(within(rail).getByRole("button", { name: /Dólar/ }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: /Cambiar moneda/ })).toBeNull();
    fireEvent.click(within(rail).getByRole("button", { name: /UF/ }));
    expect(await screen.findByTestId("rate-card-CLF")).toBeDefined();
    rect.mockRestore();
  });

  it("opens on the currency the URL names", async () => {
    respondByCurrency([row("USD", TODAY, "979.85"), row("CLF", TODAY, "41122.74")]);

    renderRoute("/exchange-rates?moneda=CLF");

    expect(await screen.findByTestId("rate-card-CLF")).toBeDefined();
    expect(screen.getByRole("button", { name: /ahora UF/ })).toBeDefined();
  });

  it("asks for the last 30 days by default and for a year when the range changes", async () => {
    list.mockResolvedValue(respond([row("USD", TODAY, "979.85"), row("CLF", TODAY, "41122.74")]));
    renderRoute();
    await screen.findByTestId("rate-card-USD");
    expect(list).toHaveBeenCalledWith({ currency: "USD", from: daysBefore(TODAY, 29), to: TODAY });

    fireEvent.click(screen.getByRole("button", { name: "1 año" }));

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        currency: "USD",
        from: daysBefore(TODAY, 364),
        to: TODAY,
      }),
    );
  });

  it("summarises the range: change, the day before, low, high, average and daily move", async () => {
    list.mockResolvedValue(
      respond([
        row("USD", TODAY, "950"),
        row("USD", daysBefore(TODAY, 1), "940"),
        row("USD", daysBefore(TODAY, 2), "900"),
        row("CLF", TODAY, "41000"),
      ]),
    );
    renderRoute();

    const usd = await screen.findByTestId("rate-card-USD");
    expect(within(usd).getByTestId("rate-now").textContent).toBe("$950,00");
    expect(within(usd).getByText(/\+\$50,00/)).toBeDefined();
    expect(within(usd).getByText("últimos 30 días")).toBeDefined();
    expect(within(usd).getByText(/día anterior \$940,00/)).toBeDefined();
    expect(within(usd).getByText("$900,00")).toBeDefined(); // low
    expect(within(usd).getByText("$930,00")).toBeDefined(); // average
    expect(within(usd).getByText("±$25,00")).toBeDefined(); // (40 + 10) / 2
  });

  it("asks for the range a preset names", async () => {
    list.mockResolvedValue(respond([row("USD", TODAY, "979.85"), row("CLF", TODAY, "41122.74")]));
    renderRoute();
    await screen.findByTestId("rate-card-USD");

    fireEvent.click(screen.getByRole("button", { name: "Este año" }));

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        currency: "USD",
        from: `${TODAY.slice(0, 4)}-01-01`,
        to: TODAY,
      }),
    );
  });

  it("compares the rate of two dates, each with the value that applied on it", async () => {
    const before = daysBefore(TODAY, 30);
    list.mockImplementation(async (params) => {
      if (params?.currency === "USD")
        return params.to === before
          ? respond([row("USD", before, "900")])
          : respond([row("USD", TODAY, "945")]);
      return respond([row("CLF", TODAY, "41000")]);
    });
    renderRoute();

    const compare = await screen.findByTestId("rate-compare");
    expect(compare.textContent).toMatch(/\+\$45,00.*\+5,0/);
    expect(screen.getByTestId("rate-compare-sentence").textContent).toBe(
      "el dólar pasó de $900,00 a $945,00.",
    );
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
