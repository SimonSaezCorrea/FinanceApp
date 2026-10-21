import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExchangeRate } from "@finance/contracts/exchange-rate-rules";

import { initRatePage, initRatesHome, type RatesData, type RatesDeps } from "./rates";

const STRINGS = {
  valueFor: "Valor del {{date}}",
  carried: "Arrastrado desde el {{date}}.",
  change: "{{amount}} ({{percent}}) respecto del {{date}}",
  noChange: "Sin cambio respecto del {{date}}",
  noData: "Sin dato para esa fecha.",
  invalid: "Fecha no válida.",
  future: "Fecha futura.",
  loading: "Buscando…",
  failed: "No se pudo.",
  using: "Con el valor del {{date}}: {{value}}",
  carriedLabel: "Arrastrado",
  publishedLabel: "Publicado",
};

const row = (date: string, value: string, valueDate = date): ExchangeRate => ({
  currency: "CLF",
  date,
  value,
  valueDate,
});

const BUILT = [row("2026-10-20", "40000"), row("2026-10-19", "39990"), row("2025-10-21", "38000")];

function mount(data: Partial<RatesData> = {}) {
  const full: RatesData = {
    lang: "es",
    currency: "CLF",
    today: "2026-10-20",
    first: "2025-09-01",
    rows: BUILT,
    strings: STRINGS,
    ...data,
  };
  document.body.innerHTML = `
    <script type="application/json" id="rates-data">${JSON.stringify(full)}</script>
    <div data-rate-root data-currency="CLF">
      <p data-rate-label>Valor del 20 de octubre de 2026</p>
      <div data-rate-body><p data-rate-value>$40.000,00</p></div>
      <p data-rate-unavailable hidden>Sin valor</p>
      <p data-rate-change>built change</p>
      <p data-rate-carried hidden></p>
    </div>
    <p data-rate-notice hidden></p>
    <button data-rate-today hidden>Volver a hoy</button>
    <input type="date" data-rate-date-input />
    <input data-conv-unit /><input data-conv-pesos />
    <p data-conv-using></p><p data-conv-error hidden></p>
    <input type="radio" name="rate-period" value="30" checked />
    <input type="radio" name="rate-period" value="365" />
    <table><tbody data-year-rows></tbody></table>`;
}

function deps(
  responses: (url: string) => unknown | Error = () => ({ items: [] }),
  now = new Date("2026-10-20T15:00:00Z"),
) {
  const clock = { now };
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    const body = responses(url);
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const d: RatesDeps = {
    fetcher,
    now: () => clock.now,
    loadChange: vi.fn(() => import("../lib/rateChange")),
    loadConverter: vi.fn(() => import("../lib/converter")),
  };
  return { d, fetcher, clock };
}

const fakeWindow = (search = "") => {
  const location = { search, href: `https://mifik.cl/es/valor-uf/${search}` };
  const history = {
    replaceState: vi.fn((_: unknown, __: string, url: string) => {
      location.href = url;
      location.search = new URL(url).search;
    }),
  };
  return { location, history } as unknown as Window;
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};
// The script imports these on demand; loading them once here keeps every test independent of how
// long the first `import()` of `decimal.js` takes in a busy run.
beforeAll(async () => {
  await import("../lib/rateChange");
  await import("../lib/converter");
});

const text = (sel: string) => document.querySelector(sel)?.textContent;
const hidden = (sel: string) => document.querySelector<HTMLElement>(sel)?.hidden;

describe("arrival refresh (FR-006, R5)", () => {
  beforeEach(() => mount());
  afterEach(() => vi.restoreAllMocks());

  it("asks the public endpoint for the last week of the page's currency, without credentials", async () => {
    const { d, fetcher } = deps();
    initRatePage(document, d, fakeWindow());
    await flush();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/api/v1/public/exchange-rates?");
    expect(url).toContain("currency=CLF");
    expect(url).toContain("from=2026-10-13");
    expect(url).toContain("to=2026-10-20");
    expect(init?.credentials).toBeUndefined();
  });

  it("rewrites the headline with a newer row", async () => {
    const { d } = deps(
      () => ({ items: [row("2026-10-21", "40400")] }),
      new Date("2026-10-21T15:00:00Z"),
    );
    initRatePage(document, d, fakeWindow());
    await flush();
    expect(text("[data-rate-value]")).toBe("$40.400,00");
    expect(text("[data-rate-label]")).toBe("Valor del 21 de octubre de 2026");
    // Intl puts a no-break space before "%" in es-CL.
    expect(text("[data-rate-change]")).toMatch(
      /^\+\$400,00 \(\+1,0\s%\) respecto del 20 de octubre de 2026$/,
    );
  });

  it("marks a newer row that was carried", async () => {
    const { d } = deps(() => ({ items: [row("2026-10-21", "40000", "2026-10-20")] }));
    initRatePage(document, d, fakeWindow());
    await flush();
    expect(hidden("[data-rate-carried]")).toBe(false);
    expect(text("[data-rate-carried]")).toBe("Arrastrado desde el 20 de octubre de 2026.");
    expect(text("[data-rate-change]")).toBe("Sin cambio respecto del 20 de octubre de 2026");
  });

  it("leaves the page as built when nothing newer arrives or the call fails", async () => {
    for (const response of [{ items: [row("2026-10-20", "40000")] }, new Error("down")]) {
      mount();
      const { d } = deps(() => response);
      initRatePage(document, d, fakeWindow());
      await flush();
      expect(text("[data-rate-value]")).toBe("$40.000,00");
      expect(text("[data-rate-change]")).toBe("built change");
    }
  });

  it("refreshes again when the tab comes back on a later Chile day, not the same day", async () => {
    const { d, fetcher, clock } = deps();
    initRatePage(document, d, fakeWindow());
    await flush();
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock.now = new Date("2026-10-21T15:00:00Z");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fills a headline that was built without a value", async () => {
    mount({ rows: [] });
    document.querySelector("[data-rate-unavailable]")!.removeAttribute("hidden");
    const { d } = deps(() => ({ items: [row("2026-10-20", "40000")] }));
    initRatePage(document, d, fakeWindow());
    await flush();
    expect(hidden("[data-rate-unavailable]")).toBe(true);
    expect(text("[data-rate-value]")).toBe("$40.000,00");
  });

  it("the home block refreshes both currencies in one call", async () => {
    mount({ currency: undefined });
    const { d, fetcher } = deps();
    initRatesHome(document, d);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).not.toContain("currency=");
  });
});

describe("converter (FR-010/FR-011)", () => {
  beforeEach(() => mount());

  it("fills the other side, and loads the money code only on the first keystroke", async () => {
    const { d } = deps();
    initRatePage(document, d, fakeWindow());
    await flush();
    expect(d.loadConverter).not.toHaveBeenCalled();

    const unit = document.querySelector<HTMLInputElement>("[data-conv-unit]")!;
    unit.value = "3,5";
    unit.dispatchEvent(new Event("input"));
    await flush();
    expect(d.loadConverter).toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("[data-conv-pesos]")!.value).toBe("140.000");
    expect(text("[data-conv-using]")).toBe("Con el valor del 20 de octubre de 2026: $40.000,00");

    const pesos = document.querySelector<HTMLInputElement>("[data-conv-pesos]")!;
    pesos.value = "100.000";
    pesos.dispatchEvent(new Event("input"));
    await flush();
    expect(unit.value).toBe("2,5");
  });

  it("shows no result and a short message for an invalid amount", async () => {
    const { d } = deps();
    initRatePage(document, d, fakeWindow());
    const unit = document.querySelector<HTMLInputElement>("[data-conv-unit]")!;
    unit.value = "-3";
    unit.dispatchEvent(new Event("input"));
    await flush();
    expect(document.querySelector<HTMLInputElement>("[data-conv-pesos]")!.value).toBe("");
    expect(hidden("[data-conv-error]")).toBe(false);
  });
});

describe("history and date (FR-008/FR-009)", () => {
  beforeEach(() => mount());

  it("fills the 1-year table from the page's rows on first use", async () => {
    const { d } = deps();
    initRatePage(document, d, fakeWindow());
    const year = document.querySelector<HTMLInputElement>(
      'input[name="rate-period"][value="365"]',
    )!;
    year.checked = true;
    year.dispatchEvent(new Event("change"));
    const rows = document.querySelectorAll("[data-year-rows] tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("$40.000,00");
  });

  it("a picked day shows its value, keeps it in the URL and feeds the converter", async () => {
    const { d } = deps();
    const win = fakeWindow();
    initRatePage(document, d, win);
    const input = document.querySelector<HTMLInputElement>("[data-rate-date-input]")!;
    input.value = "2026-10-19";
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(win.location.href).toBe("https://mifik.cl/es/valor-uf/?fecha=2026-10-19");
    expect(text("[data-rate-value]")).toBe("$39.990,00");
    expect(hidden("[data-rate-today]")).toBe(false);
    expect(text("[data-conv-using]")).toBe("Con el valor del 19 de octubre de 2026: $39.990,00");
  });

  it("opens a link with ?fecha= on that day", async () => {
    const { d } = deps();
    initRatePage(document, d, fakeWindow("?fecha=2026-10-19"));
    await flush();
    expect(text("[data-rate-value]")).toBe("$39.990,00");
    expect(document.querySelector<HTMLInputElement>("[data-rate-date-input]")!.value).toBe(
      "2026-10-19",
    );
  });

  it("a recorded day older than the page's rows is fetched", async () => {
    const { d, fetcher } = deps((url) =>
      url.includes("to=2025-09-15") ? { items: [row("2025-09-15", "37000")] } : { items: [] },
    );
    initRatePage(document, d, fakeWindow("?fecha=2025-09-15"));
    await flush();
    expect(fetcher.mock.calls.some(([u]) => String(u).includes("to=2025-09-15"))).toBe(true);
    expect(text("[data-rate-value]")).toBe("$37.000,00");
  });

  it("says so for a day before the first recording, and for bad links", async () => {
    const { d } = deps();
    initRatePage(document, d, fakeWindow("?fecha=2025-08-01"));
    await flush();
    expect(text("[data-rate-notice]")).toBe("Sin dato para esa fecha.");
    expect(text("[data-rate-value]")).toBe("$40.000,00");

    mount();
    initRatePage(document, deps().d, fakeWindow("?fecha=2099-01-01"));
    await flush();
    expect(text("[data-rate-notice]")).toBe("Fecha futura.");

    mount();
    initRatePage(document, deps().d, fakeWindow("?fecha=ayer"));
    await flush();
    expect(text("[data-rate-notice]")).toBe("Fecha no válida.");
  });

  it("'Volver a hoy' goes back to the latest value and clears the URL", async () => {
    const { d } = deps();
    const win = fakeWindow("?fecha=2026-10-19");
    initRatePage(document, d, win);
    await flush();
    document.querySelector<HTMLButtonElement>("[data-rate-today]")!.click();
    await flush();
    expect(text("[data-rate-value]")).toBe("$40.000,00");
    expect(win.location.href).toBe("https://mifik.cl/es/valor-uf/");
  });
});
