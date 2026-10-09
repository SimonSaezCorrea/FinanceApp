import { describe, expect, it } from "vitest";

import type { reference } from "@finance/contracts";

import i18n from "../../../i18n";
import { buildTemplate, type TemplateRefs } from "./buildTemplate";
import type { Matrix, Sheet } from "./importParsing";
import { parseTemplateSheets, readTemplate, TemplateReadError } from "./readTemplate";
import { resolveTemplate } from "./resolveTemplate";
import { existingRows, type ExistingData } from "./templateData";
import { columnHelpKey, MARKER_SHEET, TEMPLATE_SHEETS, TEMPLATE_VERSION } from "./templateSpec";

/** A typed day as the resolver sends it: the start of that day in the local zone. */
const localStart = (ymd: string) => new Date(`${ymd}T00:00:00`).toISOString();

const es = i18n.getFixedT("es");
const en = i18n.getFixedT("en");
const labelers = [es, en];

const BCI = "01890a5d-ac96-774b-bcce-b302099a8001";
const MACH = "01890a5d-ac96-774b-bcce-b302099a8002";
const TC = "01890a5d-ac96-774b-bcce-b302099a8003";
const VISA = "01890a5d-ac96-774b-bcce-b302099a8004";
const SUPER = "01890a5d-ac96-774b-bcce-b302099a8005";
const SAVINGS = "01890a5d-ac96-774b-bcce-b302099a8006";

const category = (id: string, code: string, isSystem = false): reference.Category =>
  ({ id, code, kind: "EXPENSE", isSystem, sortOrder: 0 }) as reference.Category;

const refs: TemplateRefs = {
  accounts: [
    { id: BCI, name: "BCI", type: "CHECKING", currency: "CLP" },
    { id: MACH, name: "MACH", type: "SIGHT", currency: "CLP" },
    { id: TC, name: "BCI Visa", type: "CREDIT_CARD", currency: "CLP" },
  ],
  cards: [{ id: VISA, accountId: TC, accountName: "BCI Visa", last4: "4827" }],
  categories: [category(SUPER, "SUPERMARKET"), category(SAVINGS, "SAVINGS", true)],
  currencies: ["CLP", "USD", "CLF"],
};

/** jsdom's Blob/File lack `arrayBuffer()`, which every browser has — read it the
 * old way and hand the reader a File that has it. */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
function xlsxFile(bytes: ArrayBuffer): File {
  const file = new File([bytes], "plantilla.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  return file;
}

/** A workbook as `readSpreadsheet` returns it, built by hand. */
function workbook(sheets: Record<string, Matrix>, version: number = TEMPLATE_VERSION): Sheet[] {
  return [
    ...Object.entries(sheets).map(([name, matrix]) => ({ name, matrix })),
    {
      name: MARKER_SHEET,
      matrix: [
        ["version", version],
        ["locale", "es"],
      ],
    },
  ];
}

describe("template column descriptions", () => {
  it("describes every column of every sheet, in both languages", () => {
    for (const t of labelers) {
      for (const sheet of TEMPLATE_SHEETS) {
        for (const column of sheet.columns) {
          const key = columnHelpKey(sheet.key, column.key);
          expect(i18n.exists(key, { lng: t === es ? "es" : "en" }), key).toBe(true);
        }
      }
    }
  });
});

describe("buildTemplate → readTemplate (real .xlsx round trip)", () => {
  it("writes every sheet, a hidden marker the reader recognises, and empty data sheets", async () => {
    const bytes = await bytesOf(await buildTemplate({ refs, t: es, locale: "es" }));
    // An untouched template is recognised — and has nothing to import.
    await expect(readTemplate(xlsxFile(bytes), labelers)).rejects.toMatchObject({
      reason: "empty",
    });

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Instrucciones",
      "Cuentas",
      "Tarjetas",
      "Movimientos",
      "Traspasos",
      "Deudas",
      "Pagos de deudas",
      "Cuotas",
      "Pagos de cuotas",
      "Recurrentes",
      "Metas",
      "Aportes",
      "Facturaciones",
      "Referencia",
      MARKER_SHEET,
    ]);
    expect(wb.getWorksheet(MARKER_SHEET)!.state).toBe("veryHidden");
    // Each header carries its description, also listed on Instructions.
    const financeHelp = es(columnHelpKey("movements", "financeCharge"));
    const financeColumn =
      TEMPLATE_SHEETS.find((sh) => sh.key === "movements")!.columns.findIndex(
        (c) => c.key === "financeCharge",
      ) + 1;
    expect(wb.getWorksheet("Movimientos")!.getCell(1, financeColumn).note).toBe(financeHelp);
    const helpLines = wb.getWorksheet("Instrucciones")!.getColumn(1).values.map(String);
    expect(helpLines.some((line) => line.endsWith(financeHelp))).toBe(true);
    // Only the user's active accounts and non-system categories are offered.
    const ref = wb.getWorksheet("Referencia")!;
    // The app's own first, then formulas following the file's Accounts/Cards sheets.
    const plain = (col: number) =>
      ref
        .getColumn(col)
        .values.slice(2)
        .filter((v) => typeof v === "string");
    expect(plain(1)).toEqual(["BCI", "MACH", "BCI Visa"]);
    expect(plain(2)).toEqual(["BCI Visa · ····4827"]);
    expect(ref.getCell(5, 1).formula).toContain("Cuentas");
    expect(ref.getColumn(3).values.slice(2)).toEqual([es("categories.SUPERMARKET")]);

    // Filled in by the user, then read back.
    const movements = wb.getWorksheet("Movimientos")!;
    movements.getRow(2).values = [
      new Date(Date.UTC(2025, 10, 28)),
      "Gasto",
      15000,
      null, // Moneda: empty = the account's own
      "BCI",
      null,
      es("categories.SUPERMARKET"),
      "Jumbo",
    ];
    // A charge in the card's other currency.
    movements.getRow(3).values = [
      new Date(Date.UTC(2026, 6, 9)),
      "Gasto",
      13.07,
      "USD",
      "BCI Visa",
    ];
    const filled = await wb.xlsx.writeBuffer();
    const read = await readTemplate(xlsxFile(filled as ArrayBuffer), labelers);
    expect(read.movements).toHaveLength(2);
    const { request, issues } = resolveTemplate(read, refs, labelers);
    expect(issues).toEqual([]);
    expect(request.movements[0]).toMatchObject({
      row: 2,
      occurredAt: localStart("2025-11-28"),
      type: "EXPENSE",
      amount: "15000",
      bankAccountId: BCI,
      categoryId: SUPER,
      description: "Jumbo",
    });
    expect(request.movements[0]!.currency).toBeUndefined();
    expect(request.movements[1]).toMatchObject({
      currency: "USD",
      amount: "13.07",
      bankAccountId: TC,
    });
  }, 30_000);
});

describe("pre-filled template", () => {
  const tx = (over: Record<string, unknown>) => ({
    id: "tx",
    type: "EXPENSE",
    amount: "15000",
    currency: "CLP",
    occurredAt: "2025-11-28T15:00:00.000Z",
    bankAccountId: BCI,
    cardId: null,
    categoryId: SUPER,
    description: "Jumbo",
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    financeCharge: false,
    transferGroupId: null,
    installmentPlanId: null,
    debtId: null,
    recurringExpenseId: null,
    savingsEntryId: null,
    savingsGoalId: null,
    paidStatementId: null,
    paidStatementAccountId: null,
    prepaymentStatementId: null,
    prepaymentAccountId: null,
    settlesStatementId: null,
    transferStatementId: null,
    ...over,
  });
  const data = {
    accounts: refs.accounts.map((a) => ({ ...a, cards: [] })),
    transactions: [
      tx({ id: "t-1" }),
      // A transfer pair: one row on Traspasos, not two movements.
      tx({ id: "t-2", transferGroupId: "g-1", categoryId: null, description: null }),
      tx({ id: "t-3", type: "INCOME", bankAccountId: MACH, transferGroupId: "g-1" }),
    ],
    debts: [],
    plans: [],
    recurring: [],
    goals: [],
    entries: [],
    categories: refs.categories,
    statements: [],
  } as unknown as ExistingData;

  it("writes the user's data tagged with its id, and imports only rows added below", async () => {
    const existing = existingRows(data, es);
    expect(existing.movements.map((r) => r.id)).toEqual(["t-1"]);
    expect(existing.transfers).toEqual([
      {
        id: "g-1",
        cells: expect.objectContaining({ fromAccount: "BCI", toAccount: "MACH", amount: 15000 }),
      },
    ]);

    expect(existing.accounts.map((r) => r.cells.name)).toEqual(["BCI", "MACH", "BCI Visa"]);

    const bytes = await bytesOf(await buildTemplate({ refs, t: es, locale: "es", existing }));
    // Only existing rows: adding finds nothing new.
    const untouched = await readTemplate(xlsxFile(bytes), labelers);
    expect(resolveTemplate(untouched, refs, labelers).request.movements).toEqual([]);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const movements = wb.getWorksheet("Movimientos")!;
    const idColumn = TEMPLATE_SHEETS.find((sh) => sh.key === "movements")!.columns.length + 1;
    expect(movements.getCell(1, idColumn).value).toBe("ID Cuadra");
    expect(movements.getCell(2, idColumn).value).toBe("t-1");
    expect(movements.getCell(2, 5).value).toBe("BCI");
    movements.getRow(3).values = [new Date(Date.UTC(2025, 11, 1)), "Gasto", 2000, null, "MACH"];
    const filled = await wb.xlsx.writeBuffer();
    const read = await readTemplate(xlsxFile(filled as ArrayBuffer), labelers);
    // Adding: only the new row.
    const merged = resolveTemplate(read, refs, labelers);
    expect(merged.issues).toEqual([]);
    expect(merged.request.movements.map((m) => m.row)).toEqual([3]);
    expect(merged.request.transfers).toEqual([]);
    expect(merged.request.accounts).toEqual([]);
    // Replacing: the whole history, on accounts the file itself defines.
    const replaced = resolveTemplate(read, refs, labelers, "REPLACE");
    expect(replaced.issues).toEqual([]);
    expect(replaced.request.mode).toBe("REPLACE");
    expect(replaced.request.accounts.map((a) => a.name)).toEqual(["BCI", "MACH", "BCI Visa"]);
    expect(replaced.request.movements.map((m) => m.row)).toEqual([2, 3]);
    expect(replaced.request.transfers).toHaveLength(1);
    const bci = replaced.request.accounts.find((a) => a.name === "BCI")!;
    expect(replaced.request.movements[0]!.bankAccountId).toBe(bci.id);
    expect(bci.id).not.toBe(BCI);
  }, 30_000);
});

describe("parseTemplateSheets", () => {
  it("refuses a workbook without the marker, and one of another version", () => {
    expect(() => parseTemplateSheets([{ name: "Hoja1", matrix: [["a"]] }], labelers)).toThrow(
      TemplateReadError,
    );
    try {
      parseTemplateSheets(workbook({ Movimientos: [["Fecha"], ["x"]] }, 99), labelers);
    } catch (e) {
      expect((e as TemplateReadError).reason).toBe("outdated");
    }
  });

  it("recognises sheets and headers in either language, skipping blank rows", () => {
    const read = parseTemplateSheets(
      workbook({
        Movements: [
          ["Date", "Type", "Amount", "Account", "Unknown column"],
          [null, null, null, null, null],
          ["01/02/2026", "Expense", "1.500", "bci", "ignored"],
        ],
      }),
      labelers,
    );
    expect(read.movements).toEqual([
      { row: 3, cells: { date: "01/02/2026", type: "Expense", amount: "1.500", account: "bci" } },
    ]);
  });
});

describe("resolveTemplate", () => {
  const read = (sheets: Record<string, Matrix>) => parseTemplateSheets(workbook(sheets), labelers);

  it("reads text dates day-first and Chilean amounts", () => {
    const { request, issues } = resolveTemplate(
      read({
        Movimientos: [
          ["Fecha", "Tipo", "Monto", "Cuenta"],
          ["28/11/2025", "Ingreso", "1.234.567", "BCI"],
        ],
      }),
      refs,
      labelers,
    );
    expect(issues).toEqual([]);
    expect(request.movements[0]).toMatchObject({
      occurredAt: localStart("2025-11-28"),
      type: "INCOME",
      amount: "1234567",
    });
  });

  it("reports missing and unreadable cells and unknown names, on their sheet and row", () => {
    const { request, issues } = resolveTemplate(
      read({
        Movimientos: [
          ["Fecha", "Tipo", "Monto", "Cuenta", "Tarjeta", "Categoría"],
          ["mañana", "Gasto", "", "Santander", "9999", "Casino"],
        ],
      }),
      refs,
      labelers,
    );
    expect(request.movements).toEqual([]);
    expect(issues.map((i) => `${i.sheet}:${i.row}:${i.column}:${i.code}`)).toEqual([
      "movements:2:account:unknownAccount",
      "movements:2:date:invalidDate",
      "movements:2:amount:required",
      "movements:2:card:unknownCard",
      "movements:2:category:unknownCategory",
    ]);
  });

  it("flags an account name two accounts share", () => {
    const { issues } = resolveTemplate(
      read({
        Movimientos: [
          ["Fecha", "Tipo", "Monto", "Cuenta"],
          ["01/01/2026", "Gasto", 1, "bci"],
        ],
      }),
      {
        ...refs,
        accounts: [...refs.accounts, { id: MACH, name: "BCI ", type: "SIGHT", currency: "CLP" }],
      },
      labelers,
    );
    expect(issues.map((i) => i.code)).toEqual(["ambiguousAccount"]);
  });

  it("matches a card by its last four digits within the row's account", () => {
    const { request } = resolveTemplate(
      read({
        Movimientos: [
          ["Fecha", "Tipo", "Monto", "Cuenta", "Tarjeta"],
          ["01/01/2026", "Gasto", 1, "BCI Visa", "•••• 4827"],
        ],
      }),
      refs,
      labelers,
    );
    expect(request.movements[0]!.cardId).toBe(VISA);
  });

  it("links payments by reference, and reports duplicate and unknown ones", () => {
    const { request, issues } = resolveTemplate(
      read({
        Deudas: [
          ["Referencia", "Dirección", "Contraparte", "Monto total", "Moneda", "Fecha", "Cuotas"],
          ["VICTOR", "Me deben", "Victor", 200000, "clp", "14/02/2026", 4],
          ["victor", "Debo", "Otro", 1, "CLP", "14/02/2026", 1],
        ],
        "Pagos de deudas": [
          ["Referencia", "Fecha", "Cuenta"],
          ["Victor", "14/03/2026", "BCI"],
          ["NADIE", "14/03/2026", "BCI"],
        ],
      }),
      refs,
      labelers,
    );
    expect(issues.map((i) => `${i.sheet}:${i.row}:${i.code}`)).toEqual([
      "debts:3:duplicateRef",
      "debtPayments:3:unknownRef",
    ]);
    expect(request.debts[0]).toMatchObject({
      ref: "VICTOR",
      direction: "OWED_TO_YOU",
      currency: "CLP",
      totalInstallments: 4,
      frequency: "MONTHLY",
      frequencyInterval: 1,
    });
    expect(request.debtPayments).toEqual([
      { row: 2, debtRef: "Victor", paidAt: localStart("2026-03-14"), accountId: BCI },
    ]);
  });

  it("a transfer's received amount defaults to the sent one; interest accepts a percent", () => {
    const { request, issues } = resolveTemplate(
      read({
        Traspasos: [
          ["Fecha", "Cuenta origen", "Cuenta destino", "Monto"],
          ["01/01/2026", "BCI", "MACH", 50000],
        ],
        Cuotas: [
          [
            "Referencia",
            "Descripción",
            "Fecha de compra",
            "Monto total",
            "Cuotas",
            "Moneda",
            "Interés por período",
          ],
          ["P", "Tele", "01/01/2026", 300000, 3, "CLP", "1,5%"],
        ],
      }),
      refs,
      labelers,
    );
    expect(issues).toEqual([]);
    expect(request.transfers[0]).toMatchObject({
      outgoingAmount: "50000",
      incomingAmount: "50000",
    });
    expect(request.plans[0]!.aprPerPeriod).toBe("0.015");
  });

  it("a recurring series with its last payment, and movements that name it", () => {
    const { request, issues } = resolveTemplate(
      read({
        Recurrentes: [
          ["Referencia", "Nombre", "Monto", "Moneda", "Frecuencia", "Primera fecha", "Último pago"],
          ["SPOTIFY", "Spotify", 6990, "CLP", "Mensual", "01/01/2026", "01/04/2026"],
        ],
        Movimientos: [
          ["Fecha", "Tipo", "Monto", "Cuenta", "Recurrente"],
          ["01/01/2026", "Gasto", 6990, "BCI", "spotify"],
          ["01/02/2026", "Gasto", 6990, "BCI", "NETFLIX"],
        ],
      }),
      refs,
      labelers,
    );
    expect(request.recurring[0]).toMatchObject({
      ref: "SPOTIFY",
      endDate: localStart("2026-04-01"),
    });
    expect(request.movements).toEqual([expect.objectContaining({ recurringRef: "spotify" })]);
    expect(issues.map((i) => `${i.sheet}:${i.row}:${i.column}:${i.code}`)).toEqual([
      "movements:3:recurring:unknownRef",
    ]);
  });
});
