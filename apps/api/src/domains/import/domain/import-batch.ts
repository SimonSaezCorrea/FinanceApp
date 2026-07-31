import type { imports } from "@finance/contracts";

/** A single row planned for bulk insert — `occurredAt` parsed to a `Date`,
 * ready for the repository to `createMany`. No `id`/`createdAt` yet, those
 * stay a persistence concern. */
export interface PlannedImportRow {
  type: imports.ImportRow["type"];
  amount: string;
  currency: string;
  occurredAt: Date;
  category: string | null;
  description: string | null;
  bankAccountId: string | null;
}

/**
 * `ImportBatch`: genuinely command-only per plan.md's Phase 8 description —
 * there is no long-lived aggregate to protect here, only a bulk insert of
 * pre-parsed rows already validated by the `ImportTransactionsRequest` zod
 * schema at the HTTP boundary. This static planner is the domain layer's
 * entire footprint: it owns the one non-trivial transform (string → `Date`)
 * so the handler/repository never touch raw request shapes directly.
 */
export const ImportBatch = {
  /** Factory Method (FR-008): plans the persisted shape of every row in a
   * bulk-import request. */
  planCreation(input: imports.ImportTransactionsRequest): PlannedImportRow[] {
    return input.rows.map((r) => ({
      type: r.type,
      amount: r.amount,
      currency: r.currency,
      occurredAt: new Date(r.occurredAt),
      category: r.category ?? null,
      description: r.description ?? null,
      bankAccountId: r.bankAccountId ?? null,
    }));
  },
};
