import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { ApiRequestError } from "@finance/client";
import { importApi } from "../api/importApi";
import { ImportMovementsPanel } from "./ImportMovementsPanel";

vi.mock("../api/importApi", () => ({ importApi: { transactions: vi.fn() } }));
// jsdom can't unzip a real .xlsx; the reader library is replaced by the sheets it
// would have produced.
vi.mock("read-excel-file/browser", () => ({
  default: async () => [
    {
      sheet: "Resumen",
      data: [
        ["Titular", "Javier Torres"],
        ["Periodo", "Septiembre 2026"],
      ],
    },
    {
      sheet: "Movimientos",
      data: [
        ["Fecha", "Detalle", "Monto"],
        ["01/09/2026", "Sueldo", "2.100.000"],
      ],
    },
    {
      sheet: "Cuotas",
      data: [
        ["Fecha", "Comercio", "Cargos"],
        ["05/09/2026", "Falabella", "30.000"],
      ],
    },
    { sheet: "Vacía", data: [] },
  ],
}));
vi.mock("../../reference/api/referenceApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../reference/api/referenceApi")>();
  return {
    referenceApi: {
      ...original.referenceApi,
      categories: () =>
        Promise.resolve([
          { id: "cat-super", code: "SUPERMARKET", kind: "EXPENSE", isSystem: false, sortOrder: 1 },
          { id: "cat-other", code: "OTHER", kind: "BOTH", isSystem: false, sortOrder: 2 },
        ]),
    },
  };
});
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }));

const account = {
  id: "acc-1",
  name: "Cuenta RUT",
  type: "SIGHT",
  currency: "CLP",
} as unknown as accounts.BankAccount;

// A bank export: preamble, header, a running balance column, a footer.
const CSV = [
  "Cartola de movimientos;;;;",
  "Fecha;Descripción;Cargos;Abonos;Saldo",
  "01/09/2026;Sueldo;;2.100.000;2.200.000",
  "02/09/2026;Jumbo;61.200;;2.138.800",
  "Total;;61.200;2.100.000;",
].join("\n");

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <ImportMovementsPanel open onOpenChange={vi.fn()} account={account} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

async function chooseFile() {
  const input = screen.getByLabelText(i18n.t("import.pick.title"), { selector: "input" });
  const file = new File([CSV], "cartola.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("cartola.csv");
}

describe("ImportMovementsPanel", () => {
  beforeEach(() => {
    vi.mocked(importApi.transactions).mockReset();
    toastError.mockReset();
  });

  it("detects the columns and previews what will be created", async () => {
    renderPanel();
    await chooseFile();

    // Header found below the preamble; the balance column left out.
    expect(
      (screen.getByLabelText(i18n.t("import.map.roleFor", { column: "C" })) as HTMLSelectElement)
        .value,
    ).toBe("debit");
    expect(
      (screen.getByLabelText(i18n.t("import.map.roleFor", { column: "E" })) as HTMLSelectElement)
        .value,
    ).toBe("ignore");
    expect(screen.getAllByText("Sueldo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jumbo").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: i18n.t("import.submit", { count: 2 }) }),
    ).toBeDefined();
  });

  it("imports into the account with an idempotency key", async () => {
    vi.mocked(importApi.transactions).mockResolvedValue({ imported: 2 });
    renderPanel();
    await chooseFile();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("import.submit", { count: 2 }) }));

    await waitFor(() => expect(importApi.transactions).toHaveBeenCalled());
    const [body, key] = vi.mocked(importApi.transactions).mock.calls[0]!;
    expect(body.bankAccountId).toBe("acc-1");
    expect(body.rows.map((r) => [r.type, r.amount, r.description])).toEqual([
      ["INCOME", "2100000", "Sueldo"],
      ["EXPENSE", "61200", "Jumbo"],
    ]);
    expect(key).toEqual(expect.any(String));
  });

  it("points a rejected row back to its line in the file", async () => {
    vi.mocked(importApi.transactions).mockRejectedValue(
      new ApiRequestError("OVERDRAFT_LIMIT_EXCEEDED", 400, "rows.1"),
    );
    renderPanel();
    await chooseFile();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("import.submit", { count: 2 }) }));

    // Sent row 1 is the file's line 4 (preamble + header above it).
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        i18n.t("import.rowError", {
          row: 4,
          message: i18n.t("errors.OVERDRAFT_LIMIT_EXCEEDED"),
        }),
      ),
    );
  });

  it("lists the workbook's sheets, opens on the movements one, and switches", async () => {
    renderPanel();
    const input = screen.getByLabelText(i18n.t("import.pick.title"), { selector: "input" });
    fireEvent.change(input, {
      target: { files: [new File(["x"], "cartola.xlsx")] },
    });
    await screen.findByText("cartola.xlsx");

    const tabs = screen.getAllByRole("tab");
    // The empty sheet isn't offered at all.
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("Resumen"),
      expect.stringContaining("Movimientos"),
      expect.stringContaining("Cuotas"),
    ]);
    // Opened on "Movimientos", not on the workbook's first sheet.
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText("Sueldo").length).toBeGreaterThan(0);

    fireEvent.click(tabs[2]!);
    expect(screen.getAllByRole("tab")[2]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText("Falabella").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sueldo")).toBeNull();
  });

  it("sends every mapped field, with the category and card resolved to ids", async () => {
    vi.mocked(importApi.transactions).mockResolvedValue({ imported: 1 });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nextProvider i18n={i18n}>
          <ImportMovementsPanel
            open
            onOpenChange={vi.fn()}
            account={
              {
                ...account,
                type: "CHECKING",
                cards: [{ id: "card-visa", last4: "4521", name: "Visa débito" }],
              } as unknown as accounts.BankAccount
            }
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    const csv = [
      "Fecha;Detalle;Monto;Tipo;Rubro;Tarjeta;Ciudad;Nota",
      "02/09/2026;Jumbo;61.200;Cargo;Supermercado;XXXX-4521;Providencia;boleta 12",
    ].join("\n");
    fireEvent.change(screen.getByLabelText(i18n.t("import.pick.title"), { selector: "input" }), {
      target: { files: [new File([csv], "cartola.csv", { type: "text/csv" })] },
    });
    await screen.findByText("cartola.csv");
    // The catalogue loads asynchronously; the preview names the category once it has.
    await screen.findAllByText(i18n.t("categories.SUPERMARKET"));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("import.submit", { count: 1 }) }));

    await waitFor(() => expect(importApi.transactions).toHaveBeenCalled());
    const [body] = vi.mocked(importApi.transactions).mock.calls[0]!;
    expect(body.rows[0]).toMatchObject({
      type: "EXPENSE",
      amount: "61200",
      description: "Jumbo",
      categoryId: "cat-super",
      cardId: "card-visa",
      lugar: "Providencia",
      observation: "boleta 12",
    });
  });

  it("marks problems right in the sheet: a broken date and an unknown category", async () => {
    renderPanel();
    const csv = [
      "Fecha;Detalle;Monto;Rubro",
      "02/09/2026;Jumbo;-61.200;Supermercado",
      "31/02/2026;Farmacia;-8.990;Salud",
      "05/09/2026;Netflix;-9.490;Streaming",
    ].join("\n");
    fireEvent.change(screen.getByLabelText(i18n.t("import.pick.title"), { selector: "input" }), {
      target: { files: [new File([csv], "cartola.csv", { type: "text/csv" })] },
    });
    await screen.findByText("cartola.csv");
    await screen.findAllByText("Jumbo");

    // The row that can't be read is counted, and its date cell is the one marked.
    expect(screen.getByText(i18n.t("import.withIssues", { count: 1 }))).toBeDefined();
    expect(screen.getByText("31/02/2026").className).toContain("decoration-wavy");
    // "Streaming" isn't in the catalogue: flagged in its own cell.
    await screen.findByLabelText(
      i18n.t("import.grid.unmatched", { fallback: i18n.t("import.grid.noValue") }),
    );
    expect(
      screen.getByRole("button", { name: i18n.t("import.submit", { count: 2 }) }),
    ).toBeDefined();
  });

  it("explains an unsupported file", async () => {
    renderPanel();
    const input = screen.getByLabelText(i18n.t("import.pick.title"), { selector: "input" });
    fireEvent.change(input, {
      target: { files: [new File(["x"], "cartola.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText(i18n.t("import.readError.unsupported"))).toBeDefined();
  });
});
