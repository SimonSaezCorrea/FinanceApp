import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression guard for FR-014 (specs/020): "Ocultar saldos" must never mask
 * Movimientos, Deudas, Recurrentes or Cuotas/Facturación — those views always
 * show real amounts, switch state notwithstanding. A source scan (rather than
 * a rendered-component test) catches the mistake at its root: nobody can
 * accidentally wrap a money label in `MaskedAmount` in these domains without
 * this test failing, regardless of which component it happens in.
 */
const DOMAINS_ROOT = join(__dirname, "..", "..");
const FORBIDDEN_DOMAINS = ["transactions", "debts", "recurring", "installments"];

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) return listFilesRecursively(full);
    return full.endsWith(".tsx") || full.endsWith(".ts") ? [full] : [];
  });
}

describe("MaskedAmount scope (FR-014 regression guard)", () => {
  it.each(FORBIDDEN_DOMAINS)("is never imported anywhere under domains/%s", (domain) => {
    const dir = join(DOMAINS_ROOT, domain);
    const offenders = listFilesRecursively(dir)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => readFileSync(file, "utf-8").includes("MaskedAmount"));

    expect(offenders).toEqual([]);
  });
});
