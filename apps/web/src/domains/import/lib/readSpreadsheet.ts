import { filledRowCount, parseCsv, type Matrix, type Sheet } from "./importParsing";

export type ReadError = "unsupported" | "empty" | "unreadable";

/** Reading failed for a reason the UI can explain. */
export class SpreadsheetReadError extends Error {
  constructor(public readonly reason: ReadError) {
    super(reason);
  }
}

function readAsText(file: File, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file, encoding);
  });
}

/**
 * A CSV's text. Many Chilean banks export Windows-1252 (Latin-1), not UTF-8:
 * read as UTF-8, "Descripción" comes out as "Descripci�n" and the header no
 * longer matches. So UTF-8 first, and a re-read as Windows-1252 when it produced
 * replacement characters.
 */
async function readCsvText(file: File): Promise<string> {
  const utf8 = await readAsText(file, "utf-8");
  return utf8.includes("\uFFFD") ? readAsText(file, "windows-1252") : utf8;
}

/**
 * Every sheet of a file that has content, in the workbook's order.
 * A CSV is one nameless sheet. `.xlsx` goes through
 * `read-excel-file`, loaded on demand so it never weighs on the app's initial
 * bundle; `.csv` through our own parser. The old binary `.xls` is not supported
 * (the user saves it as `.xlsx` or `.csv` from Excel).
 */
export async function readSpreadsheet(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  let sheets: Sheet[];
  try {
    if (name.endsWith(".csv") || file.type === "text/csv") {
      sheets = [{ name: "", matrix: parseCsv(await readCsvText(file)) }];
    } else if (name.endsWith(".xlsx")) {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const workbook = await readXlsxFile(file);
      sheets = workbook.map((s) => ({ name: s.sheet, matrix: s.data as unknown as Matrix }));
    } else {
      throw new SpreadsheetReadError("unsupported");
    }
  } catch (error) {
    if (error instanceof SpreadsheetReadError) throw error;
    throw new SpreadsheetReadError("unreadable");
  }
  // An empty sheet is noise in the sheet picker, not a choice.
  const withData = sheets.filter((s) => filledRowCount(s.matrix) > 0);
  if (withData.length === 0) throw new SpreadsheetReadError("empty");
  return withData;
}
