import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { exchangeRates } from "@finance/contracts";

import i18n from "../../../i18n";
import { summarize } from "../lib/currencySummary";
import { CURRENCY_SEARCH_MIN, CurrencyList } from "./CurrencyList";

// Future currencies aren't in the contract yet: the list only needs codes.
const many = ["USD", "CLF", "EUR", "GBP", "JPY"] as unknown as exchangeRates.ExchangeCurrency[];

function renderList(currencies: exchangeRates.ExchangeCurrency[], onChange = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <CurrencyList
        currencies={currencies}
        value={currencies[0]!}
        onChange={onChange}
        name={(c) => `Moneda ${c}`}
        color={() => "red"}
        summaries={summarize([
          { currency: "USD", date: "2026-10-08", value: "950", valueDate: "2026-10-08" },
          { currency: "USD", date: "2026-10-07", value: "940.5", valueDate: "2026-10-07" },
        ])}
      />
    </I18nextProvider>,
  );
  return onChange;
}

describe("CurrencyList", () => {
  it("lists each currency with its value today and its change since the day before", () => {
    const onChange = renderList(many.slice(0, 2));
    expect(screen.getByText("$950,00")).toBeDefined();
    expect(screen.getByText("+$9,50")).toBeDefined();
    expect(screen.getByRole("button", { name: /Moneda USD/ }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.queryByLabelText("Buscar moneda")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Moneda CLF/ }));
    expect(onChange).toHaveBeenCalledWith("CLF");
  });

  it(`grows a search box from ${CURRENCY_SEARCH_MIN} currencies that filters by name or code`, () => {
    renderList(many);
    fireEvent.change(screen.getByLabelText("Buscar moneda"), { target: { value: "gbp" } });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Moneda GBP/ })).toBeDefined();

    fireEvent.change(screen.getByLabelText("Buscar moneda"), { target: { value: "zzz" } });
    expect(screen.getByText("Ninguna moneda coincide")).toBeDefined();
  });
});
