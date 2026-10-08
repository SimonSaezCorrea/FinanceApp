import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { exchangeRatesApi } from "../../exchange-rates/api/exchangeRatesApi";
import { NetWorthCard } from "./NetWorthCard";

vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: vi.fn() },
}));
vi.mock("../../auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: { hideBalances: false } }),
}));
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const usd = { currency: "USD" as const, date: "2026-10-08", value: "950", valueDate: "2026-10-08" };

function renderCard(secondary: { currency: string; total: string | number }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const worth = { total: 750000, series: [], changePct: null } as never;
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <NetWorthCard worth={worth} secondary={secondary as never} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("NetWorthCard — estimated total (spec 030)", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.mocked(exchangeRatesApi.list).mockReset();
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [],
      latest: { USD: usd, CLF: null },
    });
  });

  it("shows the other currencies as they are and the estimated total apart", async () => {
    renderCard([{ currency: "USD", total: "400" }]);

    expect(await screen.findByText(/≈ \$1\.130\.000/)).toBeDefined();
    expect(screen.getByText("US$400,00")).toBeDefined();
  });

  it("shows no estimated total when there is no other currency", async () => {
    renderCard([]);

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(screen.queryByText(/todo en CLP/)).toBeNull();
  });

  it("shows none when no rate is recorded", async () => {
    vi.mocked(exchangeRatesApi.list).mockResolvedValue({
      items: [],
      latest: { USD: null, CLF: null },
    });
    renderCard([{ currency: "USD", total: "400" }]);

    await waitFor(() => expect(exchangeRatesApi.list).toHaveBeenCalled());
    expect(screen.queryByText(/todo en CLP/)).toBeNull();
  });
});
