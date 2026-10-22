import { afterEach, describe, expect, it, vi } from "vitest";

import * as simulation from "@finance/money/installment-simulation";

import { islandJson, simulatorIsland } from "../lib/island";
import { initSimulator, type SimulatorDeps } from "./simulator";

// The page's markup, reduced to what the script reads and writes (same data-* hooks as the
// Astro components), with the real Spanish island.
function mount() {
  const field = (name: string, value: string) => `
    <span data-sim-prefix="${name}">$</span>
    <input data-sim-field="${name}" value="${value}" />
    <p data-sim-hint="${name}"></p>
    <p data-sim-error="${name}" hidden></p>`;
  document.body.innerHTML = `
    <script type="application/json" id="simulator-data">${islandJson(simulatorIsland("es"))}</script>
    ${field("price", "300.000")}
    <select data-sim-currency>
      <option value="CLP" selected>CLP</option><option value="CLF">UF</option><option value="USD">USD</option>
    </select>
    ${field("installments", "6")}
    ${field("monthlyRatePercent", "2")}
    <input type="radio" name="sim-system" value="FIXED" checked data-sim-system />
    <input type="radio" name="sim-system" value="CONSTANT" data-sim-system />
    ${field("stampTaxPercent", "0,396")}
    <div data-sim-tax-notice hidden><span data-sim-tax-notice-text></span><button data-sim-use-legal>Usar</button></div>
    ${field("fee", "")}
    ${field("cashPrice", "")}
    <p data-sim-live></p>
    <p data-sim-incomplete hidden></p>
    <div data-sim-results>
      <dl data-sim-payments></dl>
      <span data-sim-out="count"></span><span data-sim-out="lastNote"></span>
      <dd data-sim-out="totalPaid"></dd><dd data-sim-out="interest"></dd>
      <dd data-sim-out="costs"></dd><dd data-sim-out="cae"></dd>
      <p data-sim-out="system"></p><p data-sim-out="cash"></p>
    </div>
    <section data-sim-table><table><tbody data-sim-rows></tbody><tfoot><tr>
      <td data-sim-total="principal"></td><td data-sim-total="interest"></td>
      <td data-sim-total="costs"></td><td data-sim-total="payment"></td>
    </tr></tfoot></table></section>`;
}

const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const input = (name: string) => q<HTMLInputElement>(`[data-sim-field="${name}"]`);
const outText = (name: string) => q(`[data-sim-out="${name}"]`).textContent;

function type(name: string, value: string, data: string | null = null) {
  const el = input(name);
  el.value = value;
  el.setSelectionRange(value.length, value.length);
  el.dispatchEvent(new InputEvent("input", { data, inputType: "insertText" }));
}

function setup() {
  mount();
  const load = vi.fn(async () => simulation);
  const deps: SimulatorDeps = { load, idle: () => {} };
  const api = initSimulator(document, deps)!;
  return { load, api };
}

// Lets the awaited module load and the render run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("simulator page script (spec 034)", () => {
  it("US1: recomputes on every keystroke, loading the arithmetic once", async () => {
    const { load } = setup();
    type("price", "300000");
    await settle();
    expect(input("price").value).toBe("300.000"); // grouped while typing
    expect(outText("totalPaid")).toBe("$322.619"); // legal tax by default
    type("installments", "12");
    await settle();
    expect(q("[data-sim-payments]").textContent).toContain("Valor cuota");
    expect(outText("count")).toBe("12 cuotas");
    expect(q("[data-sim-rows]").children).toHaveLength(12);
    expect(load).toHaveBeenCalledTimes(1);
    expect(q("[data-sim-live]").textContent).toContain("CAE");
  });

  it("US1: an invalid field shows its message and no result", async () => {
    setup();
    type("installments", "0");
    await settle();
    expect(input("installments").getAttribute("aria-invalid")).toBe("true");
    expect(q('[data-sim-error="installments"]').hidden).toBe(false);
    expect(q('[data-sim-error="installments"]').textContent).toBe("Debe ser mayor que cero.");
    expect(q("[data-sim-incomplete]").hidden).toBe(false);
    expect(q("[data-sim-results]").hidden).toBe(true);
    expect(q("[data-sim-table]").hidden).toBe(true);

    type("installments", "6");
    await settle();
    expect(input("installments").hasAttribute("aria-invalid")).toBe(false);
    expect(q("[data-sim-results]").hidden).toBe(false);
  });

  it("US1: reads Spanish decimals and pasted signs", async () => {
    setup();
    type("monthlyRatePercent", "1,89");
    type("price", "$ 300.000");
    await settle();
    expect(input("price").value).toBe("300.000");
    expect(q("[data-sim-results]").hidden).toBe(false);
  });

  it("US2: the tax follows the term until edited; the legal rate can be restored", async () => {
    setup();
    type("installments", "12");
    await settle();
    expect(input("stampTaxPercent").value).toBe("0,792");
    expect(q('[data-sim-hint="stampTaxPercent"]').textContent).toContain("12 cuotas");

    type("stampTaxPercent", "0");
    await settle();
    expect(q("[data-sim-tax-notice]").hidden).toBe(false);
    type("installments", "6");
    await settle();
    expect(input("stampTaxPercent").value).toBe("0"); // kept
    expect(outText("costs")).toBe("$0");

    q("[data-sim-use-legal]").click();
    await settle();
    expect(input("stampTaxPercent").value).toBe("0,396");
    expect(q("[data-sim-tax-notice]").hidden).toBe(true);
    expect(outText("costs")).toBe("$1.188");
  });

  it("US2: a fee raises the total and the CAE", async () => {
    setup();
    type("price", "300.000");
    await settle();
    const before = outText("cae");
    type("fee", "5000");
    await settle();
    expect(outText("costs")).toBe("$6.188");
    expect(outText("cae")).not.toBe(before);
  });

  it("US3: the system switch shows first and last instalment and the difference", async () => {
    setup();
    const constant = document.querySelectorAll<HTMLInputElement>("[data-sim-system]")[1]!;
    constant.checked = true;
    constant.dispatchEvent(new Event("change"));
    await settle();
    expect(q("[data-sim-payments]").textContent).toContain("Primera cuota");
    expect(q("[data-sim-payments]").textContent).toContain("Última cuota");
    expect(outText("count")).toBe("");
    expect(outText("system")).toMatch(/^Con cuota fija pagarías \$\d[\d.]* más en total\.$/);
  });

  it("US4: a cash price changes the comparison", async () => {
    setup();
    type("cashPrice", "280.000");
    await settle();
    expect(outText("cash")).toMatch(
      /^En cuotas pagas \$42\.619 más que al contado \(15,22 % más\)\.$/,
    );
  });

  it("US4: 0% without costs says it really is interest-free", async () => {
    setup();
    type("stampTaxPercent", "");
    type("monthlyRatePercent", "0");
    await settle();
    expect(outText("cash")).toBe("Pagas lo mismo que al contado: es sin interés de verdad.");
  });

  it("a currency switch updates the signs and re-reads the amounts, never converts", async () => {
    setup();
    const select = q<HTMLSelectElement>("[data-sim-currency]");
    select.value = "CLF";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(q('[data-sim-prefix="price"]').textContent).toBe("UF");
    // Same numbers read as UF, rounded to 4 decimals per instalment (not converted).
    expect(outText("totalPaid")).toBe("UF 322.618,9942");
  });

  it("edge: costs far above the price render the full CAE", async () => {
    setup();
    type("price", "1.000");
    type("installments", "1");
    type("fee", "100.000");
    await settle();
    expect(outText("cae")).toMatch(/^\d{1,3}(\.\d{3})+,\d{2} %$/);
  });

  it("edge: 60 instalments at 10% fill the whole table", async () => {
    setup();
    type("installments", "60");
    type("monthlyRatePercent", "10");
    await settle();
    expect(q("[data-sim-rows]").children).toHaveLength(60);
    expect(q("[data-sim-results]").hidden).toBe(false);
  });

  it("FR-020: fetches nothing and stores nothing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setup();
    type("price", "450.000");
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
