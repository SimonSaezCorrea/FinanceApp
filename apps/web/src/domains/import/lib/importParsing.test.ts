import { describe, expect, it } from "vitest";

import {
  buildRows,
  detectHeaderRow,
  guessRoles,
  isMappingComplete,
  parseAmount,
  parseCsv,
  matchCard,
  matchCategory,
  parseDate,
  parseType,
  pickMovementsSheet,
  type Matrix,
} from "./importParsing";

describe("parseAmount", () => {
  it.each([
    ["1.234.567", "1234567"],
    ["$ 12.345", "12345"],
    ["-12.345", "-12345"],
    ["(12.345)", "-12345"],
    ["12.345-", "-12345"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["12,5", "12.5"],
    ["1,234,567", "1234567"],
    ["12.5", "12.5"],
    ["CLP 1.000", "1000"],
  ])("reads %s as %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("keeps real numbers from a sheet and rejects text", () => {
    expect(parseAmount(-15000)).toBe("-15000");
    expect(parseAmount("Jumbo")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["03/04/2026", "2026-04-03"],
    ["3-4-26", "2026-04-03"],
    ["03.04.2026", "2026-04-03"],
    ["2026-04-03", "2026-04-03"],
    ["03/04/2026 14:22", "2026-04-03"],
  ])("reads %s day-first as %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("reads an Excel date cell and an Excel serial number", () => {
    expect(parseDate(new Date(Date.UTC(2026, 8, 25)))).toBe("2026-09-25");
    expect(parseDate(46290)).toBe("2026-09-25");
  });

  it("rejects impossible dates and plain amounts", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate(15000)).toBeNull();
    expect(parseDate("Jumbo")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("picks ; as the delimiter and honours quotes", () => {
    const csv = 'Fecha;Detalle;Monto\n01/09/2026;"Compra; con punto y coma";-1.500\r\n';
    expect(parseCsv(csv)).toEqual([
      ["Fecha", "Detalle", "Monto"],
      ["01/09/2026", "Compra; con punto y coma", "-1.500"],
    ]);
  });
});

// A typical Chilean bank export: preamble, header, movements, a running balance
// column that must NOT be taken for the amount, and a footer.
const statement: Matrix = [
  ["Cartola de movimientos", null, null, null, null],
  ["Cuenta Corriente 00-123-45678-9", null, null, null, null],
  [null, null, null, null, null],
  ["Fecha", "Descripción", "Cargos", "Abonos", "Saldo"],
  ["01/09/2026", "Sueldo septiembre", null, "2.100.000", "2.200.000"],
  ["02/09/2026", "Jumbo Costanera", "61.200", null, "2.138.800"],
  ["03/09/2026", "Transferencia a Ana", "15.000", "", "2.123.800"],
  ["xx/09/2026", "Fila rota", "1.000", null, null],
  ["Total", null, "76.200", "2.100.000", null],
];

describe("header and roles", () => {
  it("finds the header below the bank's preamble", () => {
    expect(detectHeaderRow(statement)).toBe(3);
  });

  it("maps columns by name and leaves the running balance out", () => {
    expect(guessRoles(statement, 3)).toEqual(["date", "description", "debit", "credit", "ignore"]);
  });

  it("guesses by content when the header names nothing known", () => {
    const matrix: Matrix = [
      ["Col A", "Col B", "Col C"],
      ["01/09/2026", "Uber viaje al centro", "-4.500"],
      ["02/09/2026", "Farmacia Cruz Verde", "-8.990"],
    ];
    const roles = guessRoles(matrix, 0);
    expect(roles[0]).toBe("date");
    expect(roles[1]).toBe("description");
    // An unnamed amount column is left for the user to point out.
    expect(isMappingComplete(roles)).toBe(false);
  });
});

describe("buildRows", () => {
  it("turns debit/credit columns into typed movements, skips the footer, reports broken rows", () => {
    const result = buildRows(statement, {
      headerRow: 3,
      roles: ["date", "description", "debit", "credit", "ignore"],
      invertSign: false,
    });
    expect(
      result.rows.map(({ sourceRow, type, amount, date, description }) => ({
        sourceRow,
        type,
        amount,
        date,
        description,
      })),
    ).toEqual([
      {
        sourceRow: 5,
        type: "INCOME",
        amount: "2100000",
        date: "2026-09-01",
        description: "Sueldo septiembre",
      },
      {
        sourceRow: 6,
        type: "EXPENSE",
        amount: "61200",
        date: "2026-09-02",
        description: "Jumbo Costanera",
      },
      {
        sourceRow: 7,
        type: "EXPENSE",
        amount: "15000",
        date: "2026-09-03",
        description: "Transferencia a Ana",
      },
    ]);
    expect(result.issues).toEqual([{ sourceRow: 8, reason: "invalidDate" }]);
  });

  it("reads a single signed amount column, and can flip it", () => {
    const matrix: Matrix = [
      ["Fecha", "Glosa", "Monto"],
      ["01/09/2026", "Compra", "25.000"],
      ["02/09/2026", "Pago", "-10.000"],
    ];
    const mapping = { headerRow: 0, roles: ["date", "description", "amount"] as const };
    const plain = buildRows(matrix, { ...mapping, roles: [...mapping.roles], invertSign: false });
    expect(plain.rows.map((r) => r.type)).toEqual(["INCOME", "EXPENSE"]);
    const flipped = buildRows(matrix, { ...mapping, roles: [...mapping.roles], invertSign: true });
    expect(flipped.rows.map((r) => r.type)).toEqual(["EXPENSE", "INCOME"]);
    expect(flipped.rows[0]!.amount).toBe("25000");
  });

  it("refuses a row with both a debit and a credit", () => {
    const matrix: Matrix = [
      ["Fecha", "Cargo", "Abono"],
      ["01/09/2026", "1.000", "2.000"],
    ];
    const result = buildRows(matrix, {
      headerRow: 0,
      roles: ["date", "debit", "credit"],
      invertSign: false,
    });
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([{ sourceRow: 2, reason: "ambiguousAmount" }]);
  });
});

describe("pickMovementsSheet", () => {
  it("opens on the sheet that looks like movements, not the workbook's first one", () => {
    const sheets = [
      {
        name: "Resumen",
        matrix: [
          ["Titular", "Javier"],
          ["Periodo", "Sep 2026"],
        ] as Matrix,
      },
      { name: "Movimientos", matrix: statement },
    ];
    expect(pickMovementsSheet(sheets)).toBe(1);
  });

  it("keeps the first one when none is recognisable", () => {
    const blank = [["a", "b"]] as Matrix;
    expect(
      pickMovementsSheet([
        { name: "A", matrix: blank },
        { name: "B", matrix: blank },
      ]),
    ).toBe(0);
  });
});

describe("movement fields beyond the money", () => {
  const card: Matrix = [
    [
      "Fecha",
      "Detalle",
      "Monto",
      "Tipo",
      "Rubro",
      "Tarjeta",
      "Comercio",
      "Ciudad",
      "Interés",
      "Nota",
    ],
    [
      "02/09/2026",
      "Jumbo",
      "61.200",
      "Cargo",
      "Supermercado",
      "XXXX-4521",
      "Cencosud",
      "Providencia",
      "",
      "boleta 12",
    ],
    ["03/09/2026", "Pago", "100.000", "Abono", "", "", "", "", "", ""],
    ["04/09/2026", "Interés rotativo", "3.500", "Cargo", "", "", "", "", "Sí", ""],
    ["05/09/2026", "Raro", "1.000", "???", "", "", "", "", "", ""],
  ];

  it("recognises every column by its header", () => {
    expect(guessRoles(card, 0)).toEqual([
      "date",
      "description",
      "amount",
      "type",
      "category",
      "card",
      "ignore",
      "lugar",
      "financeCharge",
      "observation",
    ]);
  });

  it("lets a type column decide the sign, and reports a type it can't read", () => {
    const roles = guessRoles(card, 0);
    roles[6] = "receptor";
    const result = buildRows(card, { headerRow: 0, roles, invertSign: false });
    expect(result.rows.map((r) => r.type)).toEqual(["EXPENSE", "INCOME", "EXPENSE"]);
    expect(result.rows[0]).toMatchObject({
      amount: "61200",
      categoryText: "Supermercado",
      cardText: "XXXX-4521",
      receptor: "Cencosud",
      lugar: "Providencia",
      observation: "boleta 12",
      financeCharge: false,
    });
    expect(result.rows[2]!.financeCharge).toBe(true);
    expect(result.issues).toEqual([{ sourceRow: 5, reason: "invalidType" }]);
  });

  it.each([
    ["Cargo", "EXPENSE"],
    ["D", "EXPENSE"],
    ["-", "EXPENSE"],
    ["ABONO", "INCOME"],
    ["C", "INCOME"],
    ["Devolución", "INCOME"],
    ["otro", null],
  ])("reads the type %s as %s", (input, expected) => {
    expect(parseType(input)).toBe(expected);
  });

  it("matches a category by name, exact first, then by containment", () => {
    const candidates = [
      { id: "super", names: ["Supermercado", "Groceries", "SUPERMARKET"] },
      { id: "transport", names: ["Transporte", "TRANSPORT"] },
    ];
    expect(matchCategory("SUPERMERCADO", candidates)).toBe("super");
    expect(matchCategory("Supermercados Líder", candidates)).toBe("super");
    expect(matchCategory("groceries", candidates)).toBe("super");
    expect(matchCategory("Streaming", candidates)).toBeNull();
    expect(matchCategory("", candidates)).toBeNull();
  });

  it("matches a card by its last four digits, however the bank prints it", () => {
    const cards = [{ id: "visa", last4: "4521" }];
    expect(matchCard("XXXX-XXXX-XXXX-4521", cards)).toBe("visa");
    expect(matchCard("•••• 4521", cards)).toBe("visa");
    expect(matchCard("7710", cards)).toBeNull();
    expect(matchCard("12", cards)).toBeNull();
  });
});
