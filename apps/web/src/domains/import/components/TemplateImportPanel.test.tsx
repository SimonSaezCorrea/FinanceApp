import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { imports } from "@finance/contracts";

import i18n from "../../../i18n";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { importApi } from "../api/importApi";
import type { TemplateRefs } from "../lib/buildTemplate";
import { TemplateImportPanel } from "./TemplateImportPanel";

vi.mock("../api/importApi", () => ({
  importApi: { previewTemplate: vi.fn(), importTemplate: vi.fn() },
}));

// jsdom can't unzip a real .xlsx (the round trip is covered in `template.test.ts`);
// the reader library is replaced by the sheets it would have produced.
const workbook = vi.hoisted(() => ({ sheets: [] as { sheet: string; data: unknown[][] }[] }));
vi.mock("read-excel-file/browser", () => ({ default: async () => workbook.sheets }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const BCI = "01890a5d-ac96-774b-bcce-b302099a8001";
const MACH = "01890a5d-ac96-774b-bcce-b302099a8002";
const refs: TemplateRefs = {
  accounts: [
    { id: BCI, name: "BCI", type: "CHECKING", currency: "CLP" },
    { id: MACH, name: "MACH", type: "SIGHT", currency: "CLP" },
  ],
  cards: [],
  categories: [],
  currencies: ["CLP"],
};

const MARKER = {
  sheet: "_cuadra",
  data: [
    ["version", 1],
    ["locale", "es"],
  ],
};
const movements = (...rows: unknown[][]) => ({
  sheet: "Movimientos",
  data: [["Fecha", "Tipo", "Monto", "Cuenta"], ...rows],
});

const valid: imports.TemplatePreviewResponse = {
  valid: true,
  counts: {
    movements: 1,
    transfers: 0,
    debts: 0,
    debtPayments: 0,
    plans: 0,
    planPayments: 0,
    recurring: 0,
    goals: 0,
    contributions: 0,
  },
  accounts: [
    {
      accountId: BCI,
      currency: "CLP",
      mode: "INCLUDED",
      netCash: "-15000",
      netCredit: "0",
      balanceAfter: "100000",
      creditUsedAfter: "0",
    },
  ],
  errors: [],
};

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <TemplateImportPanel open onOpenChange={vi.fn()} refs={refs} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function upload() {
  fireEvent.change(screen.getByLabelText("Elige o arrastra tu plantilla"), {
    target: { files: [new File(["x"], "plantilla.xlsx")] },
  });
}

describe("TemplateImportPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(importApi.previewTemplate).mockReset();
    vi.mocked(importApi.importTemplate).mockReset();
    toast.success.mockReset();
  });

  it("previews a valid template, then imports it with an idempotency key", async () => {
    workbook.sheets = [movements(["28/11/2025", "Gasto", 15000, "BCI"]), MARKER];
    vi.mocked(importApi.previewTemplate).mockResolvedValue(valid);
    vi.mocked(importApi.importTemplate).mockResolvedValue({ counts: valid.counts });
    renderPanel();
    upload();

    expect(await screen.findByText("Qué se va a importar")).toBeTruthy();
    expect(importApi.previewTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        movements: [
          expect.objectContaining({ row: 2, type: "EXPENSE", amount: "15000", bankAccountId: BCI }),
        ],
      }),
    );
    // The reimport warning is shown before confirming (FR-027).
    expect(screen.getByText(/todo se creará de nuevo/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(importApi.importTemplate).toHaveBeenCalled());
    const [, key] = vi.mocked(importApi.importTemplate).mock.calls[0]!;
    expect(typeof key).toBe("string");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Plantilla importada"));
  });

  it("switching an account's balance mode previews again with that mode", async () => {
    workbook.sheets = [movements(["28/11/2025", "Gasto", 15000, "BCI"]), MARKER];
    vi.mocked(importApi.previewTemplate).mockResolvedValue(valid);
    renderPanel();
    upload();

    fireEvent.click(await screen.findByRole("button", { name: "Súmalo a mi saldo" }));
    await waitFor(() =>
      expect(importApi.previewTemplate).toHaveBeenLastCalledWith(
        expect.objectContaining({ balanceModes: [{ accountId: BCI, mode: "ADD" }] }),
      ),
    );
  });

  it("lists problems from several sheets, on their row, and doesn't let it import", async () => {
    workbook.sheets = [
      movements(["mañana", "Gasto", 1, "Santander"]),
      {
        sheet: "Pagos de deudas",
        data: [
          ["Referencia", "Fecha", "Cuenta"],
          ["NADIE", "01/01/2026", "BCI"],
        ],
      },
      MARKER,
    ];
    renderPanel();
    upload();

    expect(await screen.findByText("3 problemas por corregir")).toBeTruthy();
    expect(screen.getByText("Movimientos · fila 2: la cuenta «Santander» no existe")).toBeTruthy();
    expect(
      screen.getByText("Pagos de deudas · fila 2: no hay ninguna fila con la referencia «NADIE»"),
    ).toBeTruthy();
    // Nothing is sent while the file has problems of its own.
    expect(importApi.previewTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Importar" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the server's problems located on their sheet and row", async () => {
    workbook.sheets = [movements(["28/11/2025", "Gasto", 15000, "BCI"]), MARKER];
    vi.mocked(importApi.previewTemplate).mockResolvedValue({
      ...valid,
      valid: false,
      errors: [{ code: "PREPAID_INSUFFICIENT_BALANCE", sheet: "movements", row: 2 }],
    });
    renderPanel();
    upload();

    expect(await screen.findByText(/^Movimientos · fila 2:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar" }).hasAttribute("disabled")).toBe(true);
  });

  it("a commit refused on a row points at it", async () => {
    workbook.sheets = [movements(["28/11/2025", "Gasto", 15000, "BCI"]), MARKER];
    vi.mocked(importApi.previewTemplate).mockResolvedValue(valid);
    vi.mocked(importApi.importTemplate).mockRejectedValue(
      new ApiRequestError("OVERDRAFT_LIMIT_EXCEEDED", 400, "movements.2"),
    );
    renderPanel();
    upload();
    fireEvent.click(await screen.findByRole("button", { name: "Importar" }));
    expect(await screen.findByText(/^Movimientos · fila 2:/)).toBeTruthy();
  });

  it("explains a file that isn't a template, pointing to the statement importer", async () => {
    workbook.sheets = [
      {
        sheet: "Hoja1",
        data: [
          ["Fecha", "Monto"],
          ["01/01/2026", 1],
        ],
      },
    ];
    renderPanel();
    upload();
    expect(
      await screen.findByText(/no es una plantilla de Cuadra.*importador de cartolas/),
    ).toBeTruthy();
  });

  it("explains a template from another version", async () => {
    workbook.sheets = [
      movements(["28/11/2025", "Gasto", 1, "BCI"]),
      { ...MARKER, data: [["version", 99]] },
    ];
    renderPanel();
    upload();
    expect(await screen.findByText(/versión anterior/)).toBeTruthy();
  });
});
